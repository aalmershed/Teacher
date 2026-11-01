import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { chooseAction } from '@/components/doc-list';
import { Text } from '@/components/ui';
import { API_URL, authHeaders, uploadFile, type LocalFile } from '@/lib/api';
import { itemUrl, randomHex } from '@/lib/project-types';
import { colors, radius } from '@/theme';
import { Field, RemoveX, SmallButton, type BlockProps } from './basic';

const MAX_FILES_PER_ITEM = 20;

// ---------- اختيار صورة وتصغيرها قبل الرفع (مثل shrinkImage في الموقع) ----------
async function pickImage(fromCamera: boolean): Promise<LocalFile | null> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
  if (!perm.granted) {
    Alert.alert('الكاميرا غير مسموحة', 'اسمح للتطبيق باستخدام الكاميرا من Settings ← مركز المعلم.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const max = 1800;
  const ctx = ImageManipulator.manipulate(a.uri);
  if (Math.max(a.width, a.height) > max) ctx.resize(a.width >= a.height ? { width: max } : { height: max });
  const png = a.mimeType === 'image/png';
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.86, format: png ? SaveFormat.PNG : SaveFormat.JPEG });
  return { uri: out.uri, name: png ? 'image.png' : 'image.jpg', mimeType: png ? 'image/png' : 'image/jpeg' };
}

export const imageUrl = (id: string) => `${API_URL}/i/${id}`;

// ---------- معرض الصور ----------
export function ImagesBlock({ block, update }: BlockProps<'images'>) {
  const [busy, setBusy] = useState<number | null>(null);

  const choose = (i: number) => chooseAction('إضافة صورة', [
    { label: 'اختيار من الصور', onPress: () => upload(i, false) },
    { label: 'التصوير بالكاميرا', onPress: () => upload(i, true) },
  ]);

  const upload = async (i: number, camera: boolean) => {
    try {
      const file = await pickImage(camera);
      if (!file) return;
      setBusy(i);
      const { id } = await uploadFile<{ id: string }>('/api/uploads', file);
      update((b) => { if (b.items[i]) b.items[i].uploadId = id; });
    } catch (e: any) {
      Alert.alert('تعذر رفع الصورة', e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {block.items.map((it, i) => (
          <View key={i} style={styles.tile}>
            <Pressable style={styles.pic} onPress={() => choose(i)}>
              {busy === i ? <ActivityIndicator color={colors.brand} />
                : it.uploadId ? <Image source={{ uri: imageUrl(it.uploadId) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                : <View style={{ alignItems: 'center', gap: 4 }}><Ionicons name="camera-outline" size={28} color={colors.muted} /><Text muted style={{ fontSize: 12 }}>اضغط لإضافة صورة</Text></View>}
              <View style={styles.x}><RemoveX onPress={() => update((b) => { b.items.splice(i, 1); })} /></View>
            </Pressable>
            <Field value={it.caption} onChangeText={(v) => update((b) => { b.items[i].caption = v; })} placeholder="وصف الصورة (اختياري)" style={{ fontSize: 13, paddingVertical: 7 }} />
          </View>
        ))}
      </View>
      <SmallButton title="＋ إضافة صورة" onPress={() => update((b) => { b.items.push({ uploadId: '', caption: '' }); })} />
    </View>
  );
}

// ---------- رمز QR من الخادم (نفس رمز الملف المطبوع) ----------
function Qr({ url }: { url: string }) {
  const [qr, setQr] = useState({ url: '', xml: '' });
  const xml = url && qr.url === url ? qr.xml : '';
  useEffect(() => {
    if (!url) return;
    let live = true;
    // ننتظر قليلًا بعد الكتابة حتى لا نطلب رمزًا مع كل حرف
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/qr?u=${encodeURIComponent(url)}`, { headers: authHeaders() }).then((r) => r.text()).then((s) => { if (live) setQr({ url, xml: s }); }).catch(() => {});
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [url]);
  return (
    <View style={styles.qr}>
      {xml ? <SvgXml xml={xml} width={64} height={64} /> : <Text muted style={{ fontSize: 12 }}>QR</Text>}
    </View>
  );
}

// ---------- الروابط وملفات الشواهد ----------
export function LinksBlock({ block, update, base }: BlockProps<'links'> & { base: string }) {
  const [progress, setProgress] = useState<{ i: number; text: string } | null>(null);

  const attach = async (i: number) => {
    const have = block.items[i]?.files?.length || 0;
    const room = MAX_FILES_PER_ITEM - have;
    if (room <= 0) return Alert.alert('الحد الأقصى', 'الحد الأقصى 20 ملفًا للبند الواحد');
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    const queue = r.assets.slice(0, room);
    if (r.assets.length > room) Alert.alert('تنبيه', `بيترفع ${room} ملفات بس (الحد 20 للبند)`);
    let added = 0;
    for (let k = 0; k < queue.length; k++) {
      const f = queue[k];
      const label = queue.length > 1 ? `ملف ${k + 1} من ${queue.length} · ` : '';
      setProgress({ i, text: `${label}0%` });
      try {
        const { id, name } = await uploadFile<{ id: string; name: string }>(
          '/api/files',
          { uri: f.uri, name: f.name, mimeType: f.mimeType || 'application/octet-stream' },
          (pct) => setProgress({ i, text: `${label}${pct}%` }),
        );
        update((b) => {
          const it = b.items[i];
          if (!it) return;
          if (!it.files) it.files = [];
          if (!it.bundleId) it.bundleId = randomHex(16);
          it.files.push({ id, name });
          it.url = '';
          if (!it.title.trim() || it.title === 'رابط جديد') it.title = name.replace(/\.[^.]+$/, '');
        });
        added++;
      } catch (e: any) {
        Alert.alert('تعذر رفع الملف', `${f.name}: ${e.message}`);
      }
    }
    setProgress(null);
    if (added > 1) Alert.alert('تم', `تم رفع ${added} ملفات على نفس رمز QR`);
  };

  return (
    <View style={{ gap: 12 }}>
      <Text muted style={{ fontSize: 13 }}>ارفع ملف الشاهد مباشرة (PDF، Word، صور...) أو حط رابط، ويطلع في الملف زر مع رمز QR تلقائي.</Text>
      {block.items.map((it, i) => {
        const files = it.files || [];
        return (
          <View key={i} style={styles.lrow}>
            <View style={{ flex: 1, gap: 8 }}>
              <Field value={it.title} onChangeText={(v) => update((b) => { b.items[i].title = v; })} placeholder="عنوان الشاهد" />
              {progress?.i === i ? (
                <View style={styles.progress}><ActivityIndicator color={colors.brand} /><Text muted>{progress.text}</Text></View>
              ) : files.length ? (
                <View style={{ gap: 6 }}>
                  {files.map((f, fi) => (
                    <View key={f.id} style={styles.chip}>
                      <Ionicons name="document-text-outline" size={16} color={colors.brandDark} />
                      <Pressable style={{ flex: 1 }} onPress={() => WebBrowser.openBrowserAsync(`${base}/f/${f.id}`)}>
                        <Text numberOfLines={1} style={{ color: colors.brandDark }}>{f.name}</Text>
                      </Pressable>
                      <RemoveX label="إزالة الملف" onPress={() => update((b) => { b.items[i].files!.splice(fi, 1); })} />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SmallButton title="＋ ملف" onPress={() => attach(i)} />
                    {files.length > 1 ? <Text muted style={{ fontSize: 12, flex: 1 }}>{files.length} ملفات · رمز QR واحد يفتح قائمة فيها</Text> : null}
                  </View>
                </View>
              ) : (
                <>
                  <Field
                    value={it.url} onChangeText={(v) => update((b) => { b.items[i].url = v; })}
                    placeholder="https://... أو ارفع ملفات" autoCapitalize="none" keyboardType="url" style={{ writingDirection: 'ltr' }}
                  />
                  <Pressable onPress={() => attach(i)} style={styles.attach}>
                    <Ionicons name="attach" size={18} color="#fff" />
                    <Text weight="bold" style={{ color: '#fff', fontSize: 14 }}>رفع ملفات</Text>
                  </Pressable>
                </>
              )}
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Qr url={itemUrl(base, it)} />
              <RemoveX onPress={() => update((b) => { b.items.splice(i, 1); })} />
            </View>
          </View>
        );
      })}
      <SmallButton title="＋ إضافة شاهد" onPress={() => update((b) => { b.items.push({ title: '', url: '' }); })} />
    </View>
  );
}


const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', gap: 6 },
  pic: {
    aspectRatio: 4 / 3, borderRadius: 12, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed',
    backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  x: { position: 'absolute', top: 2, end: 2, backgroundColor: '#fff', borderRadius: 14 },
  lrow: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: radius, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  qr: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 4 },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
