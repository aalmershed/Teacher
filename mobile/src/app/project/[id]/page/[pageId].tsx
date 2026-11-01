import Ionicons from '@expo/vector-icons/Ionicons';
import type { Draft } from 'immer';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { FieldsBlock, Field, QuoteBlock, TableBlock, TextBlock } from '@/components/blocks/basic';
import { ImagesBlock, LinksBlock } from '@/components/blocks/media';
import { chooseAction } from '@/components/doc-list';
import { Note, SaveBadge, Segmented } from '@/components/editor-common';
import { Card, Empty, Text } from '@/components/ui';
import { updateProject, useProjectState } from '@/lib/project-store';
import { BLOCK_NAMES, newBlock, uid, type Block, type BlockType, type Page } from '@/lib/project-types';
import { colors, fonts } from '@/theme';

const NOTES: Partial<Record<Page['type'], string>> = {
  cover: 'بيانات الغلاف الأمامي للملف. اترك أي حقل فارغ عشان يختفي.',
  opening: 'صفحة البسملة. البسملة تظهر تلقائيًا، وتقدر تعدّل الآية تحتها أو تتركها فارغة عشان تختفي.',
  toc: 'الفهرس يتسوّى تلقائيًا من عناوين الصفحات مع أرقامها. لإخفاء صفحة من الفهرس، طفّ خيار «تظهر في الفهرس» داخل الصفحة.',
  backcover: 'الغلاف الخلفي للملف، ما يحتاج تعديل.',
};

export default function PageEditor() {
  const { pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const { project, status, rev } = useProjectState();
  const index = project ? project.data.pages.findIndex((p) => p.id === pageId) : -1;
  const page = index >= 0 ? project!.data.pages[index] : null;

  if (!project) return null;
  if (!page) return <Empty title="الصفحة غير موجودة" />;

  const isSection = page.type === 'section';
  const locked = !isSection;
  const updatePage = (fn: (p: Draft<Page>) => void) =>
    updateProject((d) => { const p = d.data.pages.find((x) => x.id === pageId); if (p) fn(p); });
  const updateBlock = (blockId: string) => (fn: (b: any) => void) =>
    updatePage((p) => { const b = p.blocks.find((x) => x.id === blockId); if (b) fn(b); });

  const moveBlock = (bi: number, dir: -1 | 1) => updatePage((p) => {
    const j = bi + dir;
    if (j < 0 || j >= p.blocks.length) return;
    [p.blocks[bi], p.blocks[j]] = [p.blocks[j], p.blocks[bi]];
  });

  const deleteBlock = (b: Block) =>
    Alert.alert('حذف المحتوى', `حذف «${BLOCK_NAMES[b.type]}${b.heading ? ': ' + b.heading : ''}» من الصفحة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'احذف', style: 'destructive', onPress: () => updatePage((p) => { p.blocks = p.blocks.filter((x) => x.id !== b.id); }) },
    ]);

  const deletePage = () =>
    Alert.alert('حذف الصفحة', `تبي تحذف صفحة «${page.title}» بكل محتواها؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'احذف', style: 'destructive',
        onPress: () => { router.back(); updateProject((d) => { d.data.pages = d.data.pages.filter((p) => p.id !== pageId); }); },
      },
    ]);

  const duplicatePage = () => {
    const copy: Page = { ...JSON.parse(JSON.stringify(page)), id: uid(), title: page.title + ' (نسخة)' };
    copy.blocks.forEach((b) => { b.id = uid(); });
    updateProject((d) => { d.data.pages.splice(index + 1, 0, copy); });
    router.setParams({ pageId: copy.id });
  };

  const menu = () => chooseAction(page.title, [
    ...(isSection ? [{ label: 'تكرار الصفحة', onPress: duplicatePage }] : []),
    ...(page.type !== 'cover' ? [{ label: 'حذف الصفحة', destructive: true, onPress: deletePage }] : []),
  ]);

  const textOnlyFull = isSection && page.width === 'full' && page.blocks.length > 0 && page.blocks.every((b) => ['text', 'quote', 'fields'].includes(b.type));

  return (
    <>
      <Stack.Screen
        options={{
          title: page.title || 'بدون عنوان',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <SaveBadge status={status} />
              {page.type !== 'cover' ? (
                <Pressable hitSlop={10} onPress={menu} accessibilityLabel="خيارات الصفحة">
                  <Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.brandDark} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Card style={{ gap: 12 }}>
            <Field
              value={page.title} onChangeText={(v) => updatePage((p) => { p.title = v; })}
              placeholder="عنوان الصفحة" style={{ fontFamily: fonts.bold, fontSize: 18 }}
            />
            {isSection ? (
              <>
                <Segmented
                  value={page.width} onChange={(v) => updatePage((p) => { p.width = v; })}
                  options={[{ value: 'half', label: 'صفحة واحدة' }, { value: 'full', label: 'صفحتين متقابلتين' }]}
                />
                <View style={styles.toc}>
                  <Text>تظهر في الفهرس</Text>
                  <Switch
                    value={!page.hideInToc} trackColor={{ true: colors.brand }}
                    onValueChange={(v) => updatePage((p) => { if (v) delete p.hideInToc; else p.hideInToc = true; })}
                  />
                </View>
              </>
            ) : null}
          </Card>

          {textOnlyFull ? <Note>هذي الصفحة نصية، فتنعرض في صفحة وحدة من الدفتر عشان ما ينقسم النص، والصفحة اللي بعدها تجي مقابلها. خيار «صفحتين متقابلتين» للصفحات اللي فيها صور أو جداول.</Note> : null}
          {NOTES[page.type] ? <Note>{NOTES[page.type]!}</Note> : null}

          {page.blocks.map((b, bi) => (
            <Card key={`${b.id}-${rev}`} style={{ gap: 12 }}>
              {locked ? null : (
                <View style={styles.blkHead}>
                  <View style={styles.type}><Text weight="bold" style={{ fontSize: 12, color: colors.brandDark }}>{BLOCK_NAMES[b.type]}</Text></View>
                  {b.type === 'quote' ? <View style={{ flex: 1 }} /> : (
                    <Field
                      value={b.heading} onChangeText={(v) => updateBlock(b.id)((x) => { x.heading = v; })}
                      placeholder="عنوان فرعي (اختياري)" style={{ flex: 1, paddingVertical: 7 }}
                    />
                  )}
                  <Pressable hitSlop={6} onPress={() => moveBlock(bi, -1)} accessibilityLabel="لأعلى"><Ionicons name="chevron-up" size={20} color={bi === 0 ? colors.line : colors.muted} /></Pressable>
                  <Pressable hitSlop={6} onPress={() => moveBlock(bi, 1)} accessibilityLabel="لأسفل"><Ionicons name="chevron-down" size={20} color={bi === page.blocks.length - 1 ? colors.line : colors.muted} /></Pressable>
                  <Pressable hitSlop={6} onPress={() => deleteBlock(b)} accessibilityLabel="حذف"><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
                </View>
              )}
              <BlockBody block={b} locked={locked} update={updateBlock(b.id)} base={project.baseUrl} />
            </Card>
          ))}

          {isSection ? (
            <Card style={{ gap: 10 }}>
              <Text weight="bold">إضافة محتوى للصفحة</Text>
              <View style={styles.adds}>
                {(Object.entries(BLOCK_NAMES) as [BlockType, string][]).map(([type, name]) => (
                  <Pressable key={type} style={styles.add} onPress={() => updatePage((p) => { p.blocks.push(newBlock(type)); })}>
                    <Text weight="bold" style={{ fontSize: 14 }}>＋ {name}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </ScrollView>
      </>
    </>
  );
}

function BlockBody({ block, locked, update, base }: { block: Block; locked: boolean; update: (fn: (b: any) => void) => void; base: string }) {
  switch (block.type) {
    case 'text': return <TextBlock block={block} locked={locked} update={update} />;
    case 'fields': return <FieldsBlock block={block} locked={locked} update={update} />;
    case 'table': return <TableBlock block={block} locked={locked} update={update} />;
    case 'images': return <ImagesBlock block={block} locked={locked} update={update} />;
    case 'links': return <LinksBlock block={block} locked={locked} update={update} base={base} />;
    case 'quote': return <QuoteBlock block={block} locked={locked} update={update} />;
  }
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 60 },
  toc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  type: { backgroundColor: colors.brandLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  adds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  add: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.bg },
});
