import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field } from '@/components/blocks/basic';
import { Button, Empty, Loading, Text } from '@/components/ui';
import { DAY_NAMES, cellKey, fmt12, loadSchedule, minutesAr, toMin, updateSchedule, upcoming, useSchedule, type Cell } from '@/lib/schedule';
import { colors } from '@/theme';

const AR = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

// نافذة إضافة حصة أو تعديلها، مع اقتراحات من القيم اللي كتبها المعلم قبل
// (يُعاد إنشاؤها لكل خانة عن طريق key، فتبدأ بقيم الخانة نفسها)
function CellEditor({ target, onClose }: { target: { day: number; p: number }; onClose: () => void }) {
  const { data } = useSchedule();
  const existing = data ? data.cells[cellKey(target.day, target.p)] : undefined;
  const [form, setForm] = useState<Cell>(() => existing || { klass: '', subject: '', place: '' });

  if (!data) return null;
  const per = data.periods[target.p];
  const suggestions = (f: keyof Cell) => [...new Set(Object.values(data.cells).map((c) => c[f]).filter(Boolean))].filter((v) => v !== form[f]).slice(0, 6);
  const set = (f: keyof Cell) => (v: string) => setForm((x) => ({ ...x, [f]: v }));
  const save = () => {
    const c = { klass: form.klass.trim(), subject: form.subject.trim(), place: form.place.trim() };
    updateSchedule((d) => { if (c.klass || c.subject || c.place) d.cells[cellKey(target.day, target.p)] = c; else delete d.cells[cellKey(target.day, target.p)]; });
    onClose();
  };
  const remove = () => { updateSchedule((d) => { delete d.cells[cellKey(target.day, target.p)]; }); onClose(); };

  const fieldWithChips = (f: keyof Cell, label: string, placeholder: string) => (
    <View style={{ gap: 6 }}>
      <Text weight="bold" style={{ fontSize: 14 }}>{label}</Text>
      <Field value={form[f]} onChangeText={set(f)} placeholder={placeholder} maxLength={f === 'klass' ? 40 : 60} returnKeyType="done" onSubmitEditing={save} />
      {suggestions(f).length ? (
        <View style={styles.chips}>
          {suggestions(f).map((s) => (
            <Pressable key={s} onPress={() => set(f)(s)} style={styles.chip}><Text style={{ fontSize: 13, color: colors.brandDark }}>{s}</Text></Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
        <View style={styles.sheetHead}>
          <Pressable onPress={onClose} hitSlop={10}><Text weight="bold" style={{ color: colors.muted }}>إلغاء</Text></Pressable>
          <Text weight="extraBold" style={{ fontSize: 16 }}>{DAY_NAMES[target.day]} · الحصة {AR(target.p + 1)} ({fmt12(per.start)})</Text>
          <Pressable onPress={save} hitSlop={10}><Text weight="bold" style={{ color: colors.brandDark }}>حفظ</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {fieldWithChips('klass', 'الصف والفصل', 'مثال: أولى ابتدائي أ')}
          {fieldWithChips('subject', 'المادة', 'مثال: الرياضيات')}
          {fieldWithChips('place', 'المدرسة أو القاعة (اختياري)', 'مثال: الإمام السيوطي')}
          <Button title="حفظ" onPress={save} />
          {existing ? <Button title="حذف الحصة" variant="danger" onPress={remove} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function Schedule() {
  const { data, status, error } = useSchedule();
  const [target, setTarget] = useState<{ day: number; p: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);

  useFocusEffect(useCallback(() => { loadSchedule(); }, []));
  // تحديث «الحصة الحالية» كل دقيقة
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  if (!data) return status === 'error' ? <Empty title="تعذر تحميل الجدول" hint={error} /> : <Loading />;

  const now = new Date();
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const u = upcoming(data, now);
  const nextLine = u ? [
    `الحصة ${AR(u.p + 1)}`,
    u.now ? `تنتهي ${fmt12(data.periods[u.p].end)}` : u.k === 0 ? `اليوم ${fmt12(data.periods[u.p].start)}${u.inMin! <= 60 ? ` (بعد ${AR(u.inMin!)} دقيقة)` : ''}` : `${u.k === 1 ? 'بكرة' : DAY_NAMES[u.day]} ${fmt12(data.periods[u.p].start)}`,
    u.c.place,
  ].filter(Boolean).join(' · ') : '';

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadSchedule(); setRefreshing(false); }} tintColor={colors.brand} />}
      >
        {u ? (
          <View style={styles.next}>
            <View style={styles.nextIc}><Ionicons name="alarm-outline" size={24} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text weight="extraBold" style={{ color: '#fff', fontSize: 16 }}>{u.now ? 'الحصة الحالية' : 'حصتك القادمة'}: {[u.c.subject, u.c.klass].filter(Boolean).join(' — ')}</Text>
              <Text style={{ color: '#eef6f4', fontSize: 13, marginTop: 2 }}>{nextLine}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.corner} />
          {data.days.map((d) => (
            <View key={d} style={[styles.dh, d === today && styles.dhToday]}>
              <Text weight="extraBold" style={{ fontSize: 12, color: d === today ? '#fff' : colors.brandDark }} numberOfLines={1}>{DAY_NAMES[d]}</Text>
            </View>
          ))}
        </View>

        {data.periods.map((per, p) => {
          const isNow = toMin(per.start) <= mins && mins < toMin(per.end);
          return (
            <View key={p} style={styles.row}>
              <View style={[styles.ph, isNow && styles.phNow]}>
                <Text weight="extraBold" style={{ fontSize: 16, color: isNow ? '#fff' : colors.brandDark }}>{AR(p + 1)}</Text>
                <Text style={{ fontSize: 9, color: isNow ? '#fff' : colors.muted }} numberOfLines={1}>{fmt12(per.start)}</Text>
              </View>
              {data.days.map((d) => {
                const c = data.cells[cellKey(d, p)];
                const live = !!c && isNow && d === today;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setTarget({ day: d, p })}
                    style={({ pressed }) => [styles.cell, c ? styles.full : styles.empty, live && styles.live, pressed && { opacity: 0.7 }]}
                    accessibilityLabel={c ? `${DAY_NAMES[d]} الحصة ${p + 1}: ${c.subject} ${c.klass}` : `إضافة حصة ${DAY_NAMES[d]} الحصة ${p + 1}`}
                  >
                    {c ? (
                      <>
                        <Text weight="extraBold" style={styles.klass} numberOfLines={2}>{c.klass || c.subject}</Text>
                        {c.klass && c.subject ? <Text style={styles.sub} numberOfLines={1}>{c.subject}</Text> : null}
                        {c.place ? <Text style={styles.place} numberOfLines={1}>{c.place}</Text> : null}
                      </>
                    ) : <Ionicons name="add" size={20} color="#c3cbc7" />}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <Button title="⚙ أوقات الحصص والتنبيه" variant="outline" onPress={() => router.push('/schedule-settings')} style={{ marginTop: 6 }} />
        <Text muted style={{ fontSize: 12, textAlign: 'center' }}>
          {data.notify.enabled ? `🔔 التنبيه مفعّل قبل كل حصة بـ ${minutesAr(data.notify.before)}` : 'فعّل التنبيه من «أوقات الحصص والتنبيه» ويوصلك إشعار قبل كل حصة.'}
        </Text>
      </ScrollView>
      {target ? <CellEditor key={cellKey(target.day, target.p)} target={target} onClose={() => setTarget(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 10, gap: 6, paddingBottom: 30 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.brandDark, borderRadius: 16, padding: 14, marginBottom: 6 },
  nextIc: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 5 },
  corner: { width: 40 },
  dh: { flex: 1, backgroundColor: colors.brandLight, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  dhToday: { backgroundColor: colors.brand },
  ph: { width: 40, backgroundColor: colors.brandLight, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  phNow: { backgroundColor: colors.accent },
  cell: { flex: 1, minHeight: 92, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: 6, gap: 2 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d9dfdc', backgroundColor: '#f7f8f7' },
  full: { borderWidth: 1.5, borderColor: '#b9d9d2', backgroundColor: '#eef6f4' },
  live: { borderColor: colors.accent, borderWidth: 2 },
  klass: { fontSize: 11.5, textAlign: 'center', lineHeight: 16 },
  sub: { fontSize: 10, color: colors.muted, textAlign: 'center' },
  place: { fontSize: 8.5, color: '#9aa29f', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.brandLight, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
});

