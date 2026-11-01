import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { MARKS, deg, fmt, sheetStore as store, studentTotal, totalMax, type Cell, type Mark, type SheetData, type Sub } from '@/lib/sheet-store';
import { colors, fonts } from '@/theme';

// رصد الدرجات على الجوال: جدول الموقع عريض، فنعرض بندًا واحدًا في كل مرة مع كل الطلاب
const toNum = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٫]/, '.').trim();

function setCell(sid: string, subId: string, fn: (c: Cell) => void) {
  store.update((x) => {
    const g = x.data.grades;
    const row = (g[sid] = g[sid] || {});
    const c = (row[subId] = row[subId] || {});
    fn(c);
  });
}

function ScoreInput({ sid, sub, value, inputRef, onNext }: {
  sid: string; sub: Sub; value: number | undefined; inputRef: (r: ComponentRef<typeof TextInput> | null) => void; onNext: () => void;
}) {
  // نص محلي حتى يقدر المعلم يكتب "7." قبل ما يكمل الرقم
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  return (
    <TextInput
      ref={inputRef}
      value={text}
      keyboardType="decimal-pad"
      returnKeyType="next"
      onSubmitEditing={onNext}
      submitBehavior="submit"
      selectTextOnFocus
      placeholder="—"
      placeholderTextColor="#b9bfbc"
      style={[styles.score, bad && { backgroundColor: '#fde2df' }]}
      onChangeText={(t) => {
        const raw = toNum(t);
        if (raw === '') { setText(''); setBad(false); setCell(sid, sub.id, (c) => { delete c.s; }); return; }
        let v = Number(raw);
        if (!Number.isFinite(v)) { setText(t); setBad(true); return; }
        if (v > sub.max || v < 0) {
          v = Math.min(sub.max, Math.max(0, v));
          setText(String(v));
          setBad(true);
          setTimeout(() => setBad(false), 900);
        } else {
          setText(t);
          setBad(false);
        }
        setCell(sid, sub.id, (c) => { c.s = v; });
      }}
    />
  );
}

export function SheetGrades({ d, rev, onEditSetup }: { d: SheetData; rev: number; onEditSetup: () => void }) {
  const subs: (Sub & { group: string })[] = [];
  d.groups.forEach((g) => g.subs.forEach((s) => subs.push({ ...s, group: g.title })));
  const [subId, setSubId] = useState(subs[0]?.id);
  const sub = subs.find((s) => s.id === subId) || subs[0];
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);

  const avg = (vals: number[]) => (vals.length ? fmt(vals.reduce((a, v) => a + v, 0) / vals.length) : '—');
  const subAvg = sub ? avg(d.sids.map((sid) => d.grades[sid]?.[sub.id]?.s).filter((v): v is number => v != null)) : '—';
  const totAvg = avg(d.sids.map((sid) => studentTotal(d, sid)).filter((v): v is number => v != null));
  const meta = [d.grade && 'الصف: ' + d.grade, d.section && 'الفصل: ' + d.section, d.term && 'الفصل الدراسي: ' + d.term, `${d.names.length} طالب`, 'المجموع من ' + totalMax(d)].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <Text weight="extraBold" style={{ fontSize: 16 }}>🔒 {[d.school, d.subject].filter(Boolean).join(' — ') || d.title}</Text>
        <Text muted style={{ fontSize: 13 }}>{meta}</Text>
        <Button title="✎ تعديل الإعدادات" variant="outline" onPress={onEditSetup} style={{ marginTop: 6, minHeight: 42 }} />
      </Card>

      <Text muted style={{ fontSize: 13 }}>اختر البند، وبعدين اضغط على الخانات الصغيرة لوضع ✓ أو ✗، واكتب الدرجة. المجموع والمتوسط يتحسبون تلقائيًا، والحفظ تلقائي.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {subs.map((s) => (
          <Pressable key={s.id} onPress={() => setSubId(s.id)} style={[styles.chip, s.id === sub?.id && styles.chipOn]}>
            <Text weight="bold" style={{ fontSize: 13, color: s.id === sub?.id ? '#fff' : colors.ink }}>{s.title || s.group || 'بند'}</Text>
            <Text style={{ fontSize: 11, color: s.id === sub?.id ? '#eef6f4' : colors.muted }}>{s.group ? `${s.group} · ` : ''}{deg(s.max)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {sub ? d.names.map((name, i) => {
        const sid = d.sids[i];
        const c = d.grades[sid]?.[sub.id] || {};
        const total = studentTotal(d, sid);
        return (
          <View key={sid} style={styles.row}>
            <View style={styles.rowHead}>
              <Text muted style={{ width: 22, fontSize: 12 }}>{i + 1}</Text>
              <Text weight="bold" style={{ flex: 1 }} numberOfLines={1}>{name}</Text>
              <Text muted style={{ fontSize: 12 }}>المجموع: <Text weight="bold" style={{ fontSize: 12 }}>{fmt(total) || '—'}</Text></Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.boxes}>
                {Array.from({ length: sub.boxes }, (_, k) => {
                  const m: Mark = c.m?.[k] || '';
                  return (
                    <Pressable
                      key={k}
                      style={styles.box}
                      accessibilityLabel={`خانة ${k + 1}`}
                      onPress={() => setCell(sid, sub.id, (cell) => {
                        const arr = cell.m ? [...cell.m] : [];
                        while (arr.length < sub.boxes) arr.push('');
                        arr[k] = MARKS[(MARKS.indexOf(arr[k] || '') + 1) % MARKS.length];
                        cell.m = arr;
                      })}
                    >
                      <Text weight="extraBold" style={{ color: m === '✗' ? '#c0392b' : '#2d7a52', fontSize: 16 }}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <ScoreInput
                key={`${sid}-${sub.id}-${rev}`}
                sid={sid} sub={sub} value={c.s}
                inputRef={(r) => { inputs.current[i] = r; }}
                onNext={() => inputs.current[i + 1]?.focus()}
              />
            </View>
          </View>
        );
      }) : null}

      <Card style={styles.avgs}>
        <View style={styles.avgRow}><Text>متوسط البند</Text><Text weight="bold">{subAvg}</Text></View>
        <View style={styles.avgRow}><Text>متوسط المجموع</Text><Text weight="bold">{totAvg}</Text></View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center' },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  row: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boxes: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  box: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fafbfa', alignItems: 'center', justifyContent: 'center' },
  score: {
    width: 64, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandLight,
    textAlign: 'center', fontFamily: fonts.extraBold, fontSize: 17, color: colors.ink,
  },
  avgs: { gap: 6 },
  avgRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
