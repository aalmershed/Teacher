import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { RemoveX, SmallButton } from '@/components/blocks/basic';
import { Segmented } from '@/components/editor-common';
import { Card, Loading, Text } from '@/components/ui';
import { DAY_NAMES, ensureNotificationPermission, fromMin, toMin, updateSchedule, useSchedule } from '@/lib/schedule';
import { colors } from '@/theme';

const AR = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const toDate = (t: string) => { const d = new Date(); d.setHours(Math.floor(toMin(t) / 60), toMin(t) % 60, 0, 0); return d; };
const fromDate = (d: Date) => fromMin(d.getHours() * 60 + d.getMinutes());

function TimeBox({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <DateTimePicker
      value={toDate(value)} mode="time" display={Platform.OS === 'ios' ? 'compact' : 'default'} locale="ar"
      onChange={(_, d) => { if (d) onChange(fromDate(d)); }}
    />
  );
}

export default function ScheduleSettings() {
  const { data } = useSchedule();
  if (!data) return <Loading />;

  const toggleDay = (day: number) => {
    const on = data.days.includes(day);
    if (on && data.days.length === 1) return Alert.alert('تنبيه', 'لازم يوم واحد على الأقل');
    updateSchedule((d) => { d.days = on ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b); });
  };

  const removePeriod = (n: number) => {
    if (data.periods.length <= 1) return Alert.alert('تنبيه', 'لازم حصة وحدة على الأقل');
    const run = () => updateSchedule((d) => {
      // نحذف حصص هذا الصف ونزيح اللي بعده لفوق
      const cells: typeof d.cells = {};
      Object.entries(d.cells).forEach(([k, c]) => { const [day, p] = k.split('-').map(Number); if (p < n) cells[k] = c; else if (p > n) cells[`${day}-${p - 1}`] = c; });
      d.cells = cells;
      d.periods.splice(n, 1);
    });
    const used = Object.keys(data.cells).some((k) => Number(k.split('-')[1]) === n);
    if (!used) return run();
    Alert.alert('حذف الحصة', `الحصة ${n + 1} فيها حصص مضافة في جدولك، وبتنحذف معها. تبي تكمل؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'احذف', style: 'destructive', onPress: run },
    ]);
  };

  const addPeriod = () => {
    if (data.periods.length >= 12) return Alert.alert('تنبيه', 'الحد الأقصى 12 حصة');
    const last = data.periods[data.periods.length - 1];
    const len = Math.max(30, toMin(last.end) - toMin(last.start));
    updateSchedule((d) => { d.periods.push({ start: last.end, end: fromMin(toMin(last.end) + len) }); });
  };

  const setNotify = async (enabled: boolean) => {
    if (enabled && !(await ensureNotificationPermission(true))) {
      Alert.alert('الإشعارات غير مسموحة', 'عشان يوصلك التنبيه، اسمح للتطبيق بالإشعارات من الإعدادات.', [
        { text: 'لاحقًا', style: 'cancel' },
        { text: 'فتح الإعدادات', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    updateSchedule((d) => { d.notify.enabled = enabled; });
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Card style={{ gap: 12 }}>
        <Text weight="extraBold" style={styles.title}>🔔 تنبيه قبل الحصة</Text>
        <View style={styles.between}>
          <Text style={{ flex: 1 }}>نبّهني على الجوال قبل كل حصة</Text>
          <Switch value={data.notify.enabled} onValueChange={setNotify} trackColor={{ true: colors.brand }} />
        </View>
        {data.notify.enabled ? (
          <Segmented
            value={String(data.notify.before) as '5' | '10' | '15'}
            onChange={(v) => updateSchedule((d) => { d.notify.before = Number(v); })}
            options={[{ value: '5', label: '5 دقائق' }, { value: '10', label: '10 دقائق' }, { value: '15', label: '15 دقيقة' }]}
          />
        ) : null}
        <Text muted style={{ fontSize: 12 }}>مثال: «عندك حصة بعد 5 دقائق — الرياضيات في أولى ابتدائي أ». التنبيه يتكرر كل أسبوع حسب جدولك، ويشتغل حتى بدون إنترنت.</Text>
      </Card>

      <Card style={{ gap: 12 }}>
        <Text weight="extraBold" style={styles.title}>أيام الدراسة</Text>
        <View style={styles.days}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = data.days.includes(d);
            return (
              <Pressable key={d} onPress={() => toggleDay(d)} style={[styles.day, on && styles.dayOn]}>
                <Text weight="bold" style={{ fontSize: 13, color: on ? '#fff' : colors.ink }}>{DAY_NAMES[d]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text weight="extraBold" style={styles.title}>أوقات الحصص</Text>
        <View style={styles.headRow}>
          <View style={{ width: 28 }} />
          <Text muted style={styles.col}>البداية</Text>
          <Text muted style={styles.col}>النهاية</Text>
          <View style={{ width: 30 }} />
        </View>
        {data.periods.map((per, i) => (
          <View key={i} style={styles.prow}>
            <Text weight="extraBold" style={{ width: 28, textAlign: 'center', color: colors.brandDark }}>{AR(i + 1)}</Text>
            <View style={styles.col}><TimeBox value={per.start} onChange={(t) => updateSchedule((d) => { d.periods[i].start = t; })} /></View>
            <View style={styles.col}><TimeBox value={per.end} onChange={(t) => updateSchedule((d) => { d.periods[i].end = t; })} /></View>
            <View style={{ width: 30, alignItems: 'center' }}><RemoveX label={`حذف الحصة ${i + 1}`} onPress={() => removePeriod(i)} /></View>
          </View>
        ))}
        <SmallButton title="＋ إضافة حصة" onPress={addPeriod} />
      </Card>
      <Text muted style={{ fontSize: 12, textAlign: 'center' }}>نفس الإعدادات تظهر لك في صفحة «جدولي» في الموقع.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontSize: 16, color: colors.brandDark },
  between: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  dayOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  col: { flex: 1, alignItems: 'center', textAlign: 'center', fontSize: 12 },
});
