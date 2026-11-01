import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Field } from '@/components/blocks/basic';
import { imageUrl, pickImage } from '@/components/blocks/media';
import { chooseAction } from '@/components/doc-list';
import { Text } from '@/components/ui';
import { uploadFile } from '@/lib/api';
import { colors } from '@/theme';

// عناصر مشتركة بين محرر الشهادات ومحرر الكشوف

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text weight="extraBold" style={{ fontSize: 16, color: colors.brandDark }}>{title}</Text>
      {children}
    </View>
  );
}

export function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text weight="bold" style={{ fontSize: 14 }}>{label}</Text>
      {children}
      {hint ? <Text muted style={{ fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

// قائمة أسماء (اسم في كل سطر). النص محلي حتى يقدر المعلم يكتب سطر جديد فاضي قبل ما يكتب الاسم.
export function NamesInput({ names, onChange, placeholder = 'اكتب كل اسم في سطر' }: { names: string[]; onChange: (names: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(() => names.filter(Boolean).join('\n'));
  return (
    <Field
      value={text} multiline placeholder={placeholder} style={{ minHeight: 120, textAlignVertical: 'top' }}
      onChangeText={(v) => {
        setText(v);
        const list = v.split('\n').map((s) => s.trim()).filter(Boolean);
        onChange(list.length ? list : ['']);
      }}
    />
  );
}

// شعار اختياري (الأيمن أو الأيسر) — يُرفع كصورة ويظهر في الشهادة أو الكشف
export function LogoPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (camera: boolean) => {
    try {
      const file = await pickImage(camera);
      if (!file) return;
      setBusy(true);
      const { id } = await uploadFile<{ id: string }>('/api/uploads', file);
      onChange(id);
    } catch (e: any) {
      Alert.alert('تعذر رفع الشعار', e.message);
    } finally {
      setBusy(false);
    }
  };
  const choose = () => chooseAction(label, [
    { label: 'اختيار من الصور', onPress: () => upload(false) },
    { label: 'التصوير بالكاميرا', onPress: () => upload(true) },
    ...(value ? [{ label: 'إزالة الشعار', destructive: true, onPress: () => onChange('') }] : []),
  ]);
  return (
    <Pressable style={styles.logo} onPress={choose}>
      {busy ? <ActivityIndicator color={colors.brand} />
        : value ? <Image source={{ uri: imageUrl(value) }} style={{ width: '90%', height: 70 }} contentFit="contain" />
        : <View style={{ alignItems: 'center', gap: 4 }}><Ionicons name="add-circle-outline" size={26} color={colors.muted} /><Text muted style={{ fontSize: 13 }}>{label}</Text></View>}
    </Pressable>
  );
}

export const docStyles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 10 },
});

const styles = StyleSheet.create({
  section: { gap: 12 },
  logo: {
    flex: 1, minHeight: 96, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line,
    backgroundColor: '#fbfdfc', alignItems: 'center', justifyContent: 'center', padding: 8,
  },
});
