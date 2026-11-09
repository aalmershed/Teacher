import Ionicons from '@expo/vector-icons/Ionicons';
import type { Draft } from 'immer';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RichText } from '@/components/rich-text';
import { Text, rtlInput } from '@/components/ui';
import { FIELD_OPTIONS, isNameField, type Block } from '@/lib/project-types';
import { colors, fonts } from '@/theme';

export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
export type BlockProps<T extends Block['type']> = { block: BlockOf<T>; locked: boolean; update: (fn: (b: Draft<BlockOf<T>>) => void) => void };

export function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor="#a5aba8" {...props} style={[styles.input, rtlInput, props.style]} />;
}

export function SmallButton({ title, onPress, danger }: { title: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.small, danger && { borderColor: colors.danger }, pressed && { opacity: 0.6 }]}>
      <Text weight="bold" style={{ fontSize: 14, color: danger ? colors.danger : colors.ink }}>{title}</Text>
    </Pressable>
  );
}

export function RemoveX({ onPress, label = 'حذف' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable hitSlop={8} onPress={onPress} accessibilityLabel={label} style={{ padding: 4 }}>
      <Ionicons name="close-circle" size={22} color={colors.danger} />
    </Pressable>
  );
}

// ---------- نص منسق ----------
export function TextBlock({ block, update }: BlockProps<'text'>) {
  return <RichText html={block.html} onChange={(html) => update((b) => { b.html = html; })} />;
}

// ---------- قائمة اختيارات (مثل إدارة التعليم) ----------
export function OptionPicker({ label, value, options, onChange, emptyLabel = 'بدون (إخفاء الحقل)' }: { label: string; value: string; options: string[]; onChange: (v: string) => void; emptyLabel?: string }) {
  const [open, setOpen] = useState(false);
  // قيمة قديمة مكتوبة يدويًا تبقى ظاهرة حتى يختار المعلم من القائمة
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.select]}>
        <Text style={{ flex: 1, color: value ? colors.ink : '#a5aba8' }} numberOfLines={2}>{value || `اختر ${label}...`}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
          <View style={styles.sheetHead}>
            <Text weight="extraBold" style={{ fontSize: 17 }}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text weight="bold" style={{ color: colors.brandDark }}>إغلاق</Text></Pressable>
          </View>
          <FlatList showsVerticalScrollIndicator={false}
            data={['', ...all]}
            keyExtractor={(o) => o || '-'}
            renderItem={({ item }) => (
              <Pressable style={styles.option} onPress={() => { onChange(item); setOpen(false); }}>
                <Text style={{ flex: 1, color: item ? colors.ink : colors.muted }}>{item || emptyLabel}</Text>
                {item === value ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ---------- حقول بيانات ----------
export function FieldsBlock({ block, locked, update }: BlockProps<'fields'>) {
  return (
    <View style={{ gap: 10 }}>
      {block.items.map((it, i) => {
        const name = isNameField(it);
        const options = FIELD_OPTIONS[it.label];
        const setValue = (v: string) => update((b) => { b.items[i].value = v; });
        return (
          <View key={i} style={styles.frow}>
            <View style={{ flex: 1, gap: 6 }}>
              {locked || name
                ? <Text weight="bold" style={{ fontSize: 14 }}>{it.label}</Text>
                : <Field value={it.label} onChangeText={(v) => update((b) => { b.items[i].label = v; })} placeholder="البند" style={{ fontFamily: fonts.bold }} />}
              {name ? (
                <View style={[styles.input, styles.lockedVal]}>
                  <Ionicons name="lock-closed" size={14} color={colors.muted} />
                  <Text style={{ flex: 1 }}>{it.value}</Text>
                  <Text muted style={{ fontSize: 12 }}>من بيانات العضوية</Text>
                </View>
              ) : options ? (
                <OptionPicker label={it.label} value={it.value} options={options} onChange={setValue} />
              ) : (
                <Field value={it.value} onChangeText={setValue} placeholder="القيمة" multiline={!locked} />
              )}
            </View>
            {locked ? null : <RemoveX onPress={() => update((b) => { b.items.splice(i, 1); })} />}
          </View>
        );
      })}
      {locked ? null : <SmallButton title="＋ إضافة بند" onPress={() => update((b) => { b.items.push({ label: '', value: '' }); })} />}
    </View>
  );
}

// ---------- جدول ----------
const CELL_W = 130;
export function TableBlock({ block, update }: BlockProps<'table'>) {
  return (
    <View style={{ gap: 10 }}>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        <View>
          <View style={styles.trow}>
            {block.columns.map((c, ci) => (
              <TextInput
                key={ci} value={c} onChangeText={(v) => update((b) => { b.columns[ci] = v; })}
                style={[styles.cell, styles.th, rtlInput]} multiline
              />
            ))}
            <View style={{ width: 34 }} />
          </View>
          {block.rows.map((r, ri) => (
            <View key={ri} style={styles.trow}>
              {block.columns.map((_, ci) => (
                <TextInput
                  key={ci} value={r[ci] ?? ''} onChangeText={(v) => update((b) => { b.rows[ri][ci] = v; })}
                  style={[styles.cell, rtlInput]} multiline
                />
              ))}
              <View style={{ width: 34, alignItems: 'center', justifyContent: 'center' }}>
                <RemoveX label="حذف الصف" onPress={() => update((b) => { b.rows.splice(ri, 1); })} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.acts}>
        <SmallButton title="＋ صف" onPress={() => update((b) => { b.rows.push(b.columns.map(() => '')); })} />
        <SmallButton title="＋ عمود" onPress={() => update((b) => { b.columns.push('عمود'); b.rows.forEach((r) => r.push('')); })} />
        <SmallButton title="− آخر عمود" onPress={() => update((b) => { if (b.columns.length > 1) { b.columns.pop(); b.rows.forEach((r) => r.pop()); } })} />
      </View>
    </View>
  );
}

// ---------- اقتباس ----------
export function QuoteBlock({ block, update }: BlockProps<'quote'>) {
  return (
    <View style={{ gap: 8 }}>
      <Text weight="bold" style={{ fontSize: 14 }}>نص الاقتباس</Text>
      <Field value={block.text} onChangeText={(v) => update((b) => { b.text = v; })} multiline />
      <Text weight="bold" style={{ fontSize: 14 }}>القائل</Text>
      <Field value={block.author} onChangeText={(v) => update((b) => { b.author = v; })} />
    </View>
  );
}

export const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: fonts.regular, color: colors.ink,
  },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedVal: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg },
  small: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  frow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  trow: { flexDirection: 'row' },
  cell: {
    width: CELL_W, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: '#fff',
    paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, fontFamily: fonts.regular, color: colors.ink, textAlignVertical: 'top',
  },
  th: { backgroundColor: colors.brandLight, fontFamily: fonts.bold },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.card },
});
