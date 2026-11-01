import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SaveBadge, Segmented, ThemePicker } from '@/components/editor-common';
import { PdfButton } from '@/components/pdf-button';
import { Button, Card, Empty, Input, Loading, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { closeProject, flush, openProject, updateProject, useProjectState } from '@/lib/project-store';
import type { Page } from '@/lib/project-types';
import { colors, radius } from '@/theme';

const PAGE_ICONS: Partial<Record<Page['type'], keyof typeof Ionicons.glyphMap>> = {
  cover: 'book', opening: 'sparkles-outline', toc: 'list-outline', backcover: 'book-outline',
};

export default function ProjectEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project, status, error } = useProjectState();
  const { user } = useAuth();
  const subscribed = !!(user?.isAdmin || user?.subscription.active);

  useEffect(() => {
    openProject(Number(id));
    return () => { closeProject(); };
  }, [id]);

  if (status === 'error' && !project) return <><Stack.Screen options={{ title: '' }} /><Empty title="تعذر فتح الملف" hint={error} /></>;
  if (!project) return <Loading />;

  const pages = project.data.pages;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    updateProject((d) => { const arr = d.data.pages; [arr[i], arr[j]] = [arr[j], arr[i]]; });
  };

  return (
    <>
      <Stack.Screen options={{ title: project.title || 'ملف الإنجاز', headerRight: () => <SaveBadge status={status} /> }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Card>
          <Input label="اسم الملف" value={project.title} onChangeText={(v) => updateProject((d) => { d.title = v; })} />
          <Text weight="bold" style={{ marginBottom: 8 }}>شكل الصفحات</Text>
          <Segmented
            value={project.data.settings.layout}
            onChange={(v) => updateProject((d) => { d.data.settings.layout = v; })}
            options={[{ value: 'spread', label: 'دفتر (صفحتين متقابلتين)' }, { value: 'single', label: 'صفحة A4 مفردة' }]}
          />
          <Text weight="bold" style={{ marginVertical: 8 }}>الألوان</Text>
          <ThemePicker value={project.data.settings.theme} onChange={(v) => updateProject((d) => { d.data.settings.theme = v; })} />
        </Card>

        <View style={styles.actions}>
          <Button
            title="👁 معاينة" variant="outline" style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/project/[id]/preview', params: { id } })}
          />
          <PdfButton path={`/api/projects/${id}/pdf`} name={`${project.title || 'ملف-إنجاز'}.pdf`} before={flush} style={{ flex: 1 }} />
        </View>
        {subscribed ? null : <Text muted style={{ fontSize: 13, textAlign: 'center' }}>التعديل والمعاينة مجانًا، وتنزيل ملف PDF للمشتركين.</Text>}

        <View style={styles.pagesHead}>
          <Text weight="extraBold" style={{ fontSize: 18 }}>الصفحات</Text>
          <Text muted>{pages.length} صفحة</Text>
        </View>

        {pages.map((p, i) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [styles.page, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/project/[id]/page/[pageId]', params: { id, pageId: p.id } })}
          >
            <View style={styles.num}>
              {PAGE_ICONS[p.type]
                ? <Ionicons name={PAGE_ICONS[p.type]!} size={18} color={colors.brandDark} />
                : <Text weight="bold" style={{ color: colors.brandDark }}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text weight="bold" numberOfLines={1}>{p.title || 'بدون عنوان'}</Text>
              {p.type === 'section' && p.width === 'full' ? <Text muted style={{ fontSize: 12 }}>صفحتين</Text> : null}
            </View>
            <Pressable hitSlop={8} onPress={() => move(i, -1)} disabled={i === 0} style={styles.mv} accessibilityLabel="لأعلى">
              <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.line : colors.muted} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => move(i, 1)} disabled={i === pages.length - 1} style={styles.mv} accessibilityLabel="لأسفل">
              <Ionicons name="chevron-down" size={20} color={i === pages.length - 1 ? colors.line : colors.muted} />
            </Pressable>
          </Pressable>
        ))}

        <Button
          title="＋ إضافة صفحة" variant="outline"
          onPress={() => router.push({ pathname: '/project/[id]/add-page', params: { id } })}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 40 },
  actions: { flexDirection: 'row', gap: 10 },
  pagesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  page: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
    borderRadius: radius, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 12,
  },
  num: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  mv: { padding: 4 },
});
