import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Segmented } from '@/components/editor-common';
import { Button, Card, Input, Text } from '@/components/ui';
import { updateProject, useProjectState } from '@/lib/project-store';
import { BLOCK_NAMES, newBlock, uid, type BlockType, type Page } from '@/lib/project-types';
import { colors } from '@/theme';

const STARTS: { value: BlockType | ''; label: string }[] = [
  { value: '', label: 'صفحة فارغة' },
  ...(Object.entries(BLOCK_NAMES) as [BlockType, string][]).map(([value, label]) => ({ value, label })),
];

export default function AddPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project } = useProjectState();
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState<'half' | 'full'>('half');
  const [start, setStart] = useState<BlockType | ''>('text');

  const add = () => {
    const page: Page = { id: uid(), type: 'section', title: title.trim() || 'صفحة جديدة', width, blocks: start ? [newBlock(start)] : [] };
    updateProject((d) => {
      // تُضاف في الآخر، وقبل الغلاف الخلفي دائمًا
      const back = d.data.pages.findIndex((p) => p.type === 'backcover');
      d.data.pages.splice(back >= 0 ? back : d.data.pages.length, 0, page);
    });
    router.dismiss();
    router.push({ pathname: '/project/[id]/page/[pageId]', params: { id, pageId: page.id } });
  };

  if (!project) return null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Card>
        <Input label="عنوان الصفحة" value={title} onChangeText={setTitle} placeholder="صفحة جديدة" autoFocus />
        <Text weight="bold" style={{ marginBottom: 8 }}>حجم الصفحة</Text>
        <Segmented value={width} onChange={setWidth} options={[{ value: 'half', label: 'صفحة واحدة' }, { value: 'full', label: 'صفحتين متقابلتين' }]} />
        <Text weight="bold" style={{ marginTop: 14, marginBottom: 8 }}>ابدأ بـ</Text>
        <View style={styles.chips}>
          {STARTS.map((s) => (
            <Pressable key={s.value} onPress={() => setStart(s.value)} style={[styles.chip, start === s.value && styles.chipOn]}>
              <Text weight="bold" style={{ fontSize: 14, color: start === s.value ? '#fff' : colors.ink }}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Button title="إضافة" onPress={add} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
