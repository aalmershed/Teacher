import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Field, OptionPicker, RemoveX, SmallButton } from '@/components/blocks/basic';
import { Labeled, LogoPicker, NamesInput, Section, docStyles } from '@/components/doc-fields';
import { Button, Card, Text } from '@/components/ui';
import { EDU_OFFICES } from '@/lib/edu-offices';
import {
  deg, groupMax, hasGrades, newId, pageCount, sheetStore as store, syncNames, totalMax,
  type Group, type SheetData, type SheetTheme,
} from '@/lib/sheet-store';
import { colors, fonts } from '@/theme';

const OTHER = 'أخرى (اكتب يدويًا)';
const clean = (v: string) => (/\.{3,}/.test(v || '') ? '' : v || ''); // تجاهل النص المؤقت القديم ذي النقاط

// قائمة اختيار مع خيار «أخرى» للكتابة اليدوية (إدارة التعليم ومكتب التعليم)
function ChoiceWithOther({ label, value, options, onChange, placeholder, emptyLabel }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder: string; emptyLabel: string;
}) {
  const v = clean(value);
  const [other, setOther] = useState(!!v && !options.includes(v));
  const manual = other || (!!v && !options.includes(v));
  return (
    <Labeled label={label}>
      <OptionPicker
        label={label} emptyLabel={emptyLabel} options={[...options, OTHER]}
        value={manual ? OTHER : v}
        onChange={(x) => {
          setOther(x === OTHER);
          onChange(x === OTHER ? '' : x);
        }}
      />
      {manual ? <Field value={v} onChangeText={onChange} placeholder={placeholder} maxLength={120} /> : null}
    </Labeled>
  );
}

function NumberBox({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <Field
      value={String(value)} keyboardType="number-pad" maxLength={3}
      onChangeText={(t) => onChange(Math.max(0, Math.min(max, Math.round(Number(t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))) || 0))))}
      style={styles.num}
    />
  );
}

// ---------- توزيع الدرجات: مجموعات وبنود ----------
function GroupsEditor({ d, defaults }: { d: SheetData; defaults: Group[] }) {
  const confirmLoss = (subIds: string[], run: () => void) => {
    if (!hasGrades(d, subIds)) return run();
    Alert.alert('فيه درجات مرصودة', 'هذا البند فيه درجات مرصودة وبتنحذف معه. تبي تكمل؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'احذف', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <View style={{ gap: 12 }}>
      {d.groups.map((g, gi) => (
        <View key={gi} style={styles.group}>
          <View style={styles.groupHead}>
            <Field
              value={g.title} maxLength={60} placeholder="اسم المجموعة" style={{ flex: 1, fontFamily: fonts.bold }}
              onChangeText={(v) => store.update((x) => { x.data.groups[gi].title = v; })}
            />
            <Text weight="bold" style={{ color: colors.brandDark, fontSize: 13 }}>{deg(groupMax(g))}</Text>
            <RemoveX
              label="حذف المجموعة"
              onPress={() => {
                if (d.groups.length <= 1) return Alert.alert('تنبيه', 'لازم مجموعة وحدة على الأقل');
                confirmLoss(g.subs.map((s) => s.id), () => store.update((x) => { x.data.groups.splice(gi, 1); }));
              }}
            />
          </View>
          <View style={styles.subHead}>
            <Text muted style={{ flex: 1, fontSize: 12 }}>البند</Text>
            <Text muted style={styles.numLabel}>الدرجة</Text>
            <Text muted style={styles.numLabel}>الخانات</Text>
            <View style={{ width: 30 }} />
          </View>
          {g.subs.map((s, si) => (
            <View key={s.id} style={styles.sub}>
              <Field
                value={s.title} maxLength={60} placeholder="اسم البند" style={{ flex: 1 }}
                onChangeText={(v) => store.update((x) => { x.data.groups[gi].subs[si].title = v; })}
              />
              <NumberBox value={s.max} max={100} onChange={(n) => store.update((x) => { x.data.groups[gi].subs[si].max = n; })} />
              <NumberBox value={s.boxes} max={12} onChange={(n) => store.update((x) => { x.data.groups[gi].subs[si].boxes = n; })} />
              <RemoveX
                label="حذف البند"
                onPress={() => {
                  if (g.subs.length <= 1) return Alert.alert('تنبيه', 'لازم بند واحد على الأقل في المجموعة');
                  confirmLoss([s.id], () => store.update((x) => { x.data.groups[gi].subs.splice(si, 1); }));
                }}
              />
            </View>
          ))}
          {g.subs.length < 4 ? (
            <SmallButton title="＋ بند" onPress={() => store.update((x) => { x.data.groups[gi].subs.push({ id: newId(), title: '', max: 5, boxes: 4 }); })} />
          ) : null}
        </View>
      ))}
      <View style={styles.acts}>
        <SmallButton
          title="＋ مجموعة جديدة"
          onPress={() => {
            if (d.groups.length >= 8) return Alert.alert('تنبيه', 'الحد الأقصى 8 مجموعات');
            store.update((x) => { x.data.groups.push({ title: 'مجموعة جديدة', subs: [{ id: newId(), title: '', max: 10, boxes: 4 }] }); });
          }}
        />
        <SmallButton
          title="استعادة التوزيع الافتراضي"
          onPress={() => {
            const run = () => store.update((x) => { x.data.groups = defaults.map((g) => ({ ...g, subs: g.subs.map((s) => ({ ...s, id: newId() })) })); });
            if (!Object.keys(d.grades || {}).length) return run();
            Alert.alert('استعادة التوزيع الافتراضي', 'بتنحذف الدرجات المرصودة. تبي تكمل؟', [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'استعادة', style: 'destructive', onPress: run },
            ]);
          }}
        />
      </View>
      <View style={styles.total}>
        <Text weight="bold">المجموع الكلي</Text>
        <Text weight="extraBold" style={{ color: colors.brandDark }}>{deg(totalMax(d))}</Text>
      </View>
      <Text muted style={{ fontSize: 12 }}>«الخانات» هي المربعات الصغيرة جنب كل بند لرصد المتابعة اليومية (مثل الواجبات أو المشاركة).</Text>
    </View>
  );
}

// ---------- إعدادات الكشف ----------
export function SheetSetup({ d, themes, defaults, rev, onDone }: { d: SheetData; themes: SheetTheme[]; defaults: Group[]; rev: number; onDone: () => void }) {
  const [namesKey, setNamesKey] = useState(0); // يتغير بعد الترتيب الأبجدي حتى يعيد حقل الأسماء قراءة القائمة
  const set = <K extends keyof SheetData>(k: K, v: SheetData[K]) => store.update((x) => { x.data[k] = v as any; });
  const pages = pageCount(d);
  const n = d.names.length;

  return (
    <Card style={{ gap: 18 }}>
      <Section title="اللون">
        <View style={styles.themes}>
          {themes.map((t) => (
            <Pressable key={t.id} onPress={() => set('theme', t.id)} style={[styles.theme, d.theme === t.id && styles.themeOn]}>
              <View style={styles.swatches}>{t.colors.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}</View>
              <Text weight={d.theme === t.id ? 'bold' : 'regular'} style={{ fontSize: 13 }}>{t.name}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="رأس الكشف">
        <ChoiceWithOther
          key={`dept-${rev}`} label="إدارة التعليم" value={d.line1} options={Object.keys(EDU_OFFICES)}
          emptyLabel="بدون" placeholder="اكتب اسم إدارة التعليم"
          onChange={(v) => store.update((x) => { if (x.data.line1 !== v) { x.data.line1 = v; if (EDU_OFFICES[v] || !v) x.data.line2 = ''; } })}
        />
        <ChoiceWithOther
          key={`office-${rev}-${d.line1}`} label="مكتب التعليم" value={d.line2} options={EDU_OFFICES[d.line1] || []}
          emptyLabel={d.line1 ? 'بدون' : 'اختر الإدارة أولًا'} placeholder="اكتب اسم مكتب التعليم"
          onChange={(v) => set('line2', v)}
        />
        <Labeled label="اسم المدرسة"><Field value={d.school} onChangeText={(v) => set('school', v)} maxLength={80} /></Labeled>
        <View style={docStyles.row2}>
          <View style={{ flex: 1 }}><Labeled label="عنوان الكشف"><Field value={d.title} onChangeText={(v) => set('title', v)} maxLength={80} /></Labeled></View>
          <View style={{ flex: 1 }}><Labeled label="العام الدراسي"><Field value={d.year} onChangeText={(v) => set('year', v)} maxLength={30} placeholder="مثال: 1448هـ" /></Labeled></View>
        </View>
      </Section>

      <Section title="بيانات الفصل">
        <View style={docStyles.row2}>
          <View style={{ flex: 1 }}><Labeled label="الصف"><Field value={d.grade} onChangeText={(v) => set('grade', v)} maxLength={40} placeholder="مثال: الأول المتوسط" /></Labeled></View>
          <View style={{ flex: 1 }}><Labeled label="الفصل"><Field value={d.section} onChangeText={(v) => set('section', v)} maxLength={40} placeholder="مثال: 1/أ" /></Labeled></View>
        </View>
        <View style={docStyles.row2}>
          <View style={{ flex: 1 }}><Labeled label="الفصل الدراسي"><Field value={d.term} onChangeText={(v) => set('term', v)} maxLength={40} placeholder="مثال: الأول" /></Labeled></View>
          <View style={{ flex: 1 }}><Labeled label="المادة (اختياري)"><Field value={d.subject} onChangeText={(v) => set('subject', v)} maxLength={60} /></Labeled></View>
        </View>
        <Labeled label="اسم المعلم (اختياري)"><Field value={d.teacher} onChangeText={(v) => set('teacher', v)} maxLength={80} /></Labeled>
      </Section>

      <Section title="أسماء الطلاب">
        <Labeled label="اسم في كل سطر" hint={n ? `${n} طالب · ${pages} ${pages > 1 ? 'صفحات' : 'صفحة'}` : 'بدون أسماء ينطبع الكشف بصفوف فارغة تكتب فيها الأسماء بيدك.'}>
          <NamesInput
            key={`${rev}-${namesKey}`} names={d.names} placeholder="اكتب أو الصق أسماء الطلاب، كل اسم في سطر"
            onChange={(list) => store.update((x) => { syncNames(x.data, list.filter(Boolean)); })}
          />
        </Labeled>
        <View style={[styles.acts, { alignItems: 'center' }]}>
          <SmallButton
            title="ترتيب أبجدي"
            onPress={() => {
              store.update((x) => {
                const pairs = x.data.names.map((nm, i) => [nm, x.data.sids[i]]).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
                x.data.names = pairs.map((p) => p[0]);
                x.data.sids = pairs.map((p) => p[1]);
              });
              setNamesKey((k) => k + 1);
            }}
          />
          <Text style={{ fontSize: 14 }}>عدد الصفوف في الصفحة</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => set('rows', Math.max(8, d.rows - 1))} hitSlop={6}><Text weight="extraBold" style={styles.step}>−</Text></Pressable>
            <Text weight="bold" style={{ minWidth: 26, textAlign: 'center' }}>{d.rows}</Text>
            <Pressable onPress={() => set('rows', Math.min(30, d.rows + 1))} hitSlop={6}><Text weight="extraBold" style={styles.step}>＋</Text></Pressable>
          </View>
        </View>
      </Section>

      <Section title="توزيع الدرجات">
        <GroupsEditor d={d} defaults={defaults} />
      </Section>

      <Section title="الشعارات (اختياري)">
        <View style={docStyles.row2}>
          <LogoPicker label="الشعار الأيمن" value={d.logoRight} onChange={(v) => set('logoRight', v)} />
          <LogoPicker label="الشعار الأيسر" value={d.logoLeft} onChange={(v) => set('logoLeft', v)} />
        </View>
        <Text muted style={{ fontSize: 12 }}>ارفع شعار مدرستك أو أي شعار عندك حق استخدامه (PNG بخلفية شفافة يعطي أفضل نتيجة).</Text>
      </Section>

      <Button
        title="✓ حفظ الإعدادات والانتقال لرصد الدرجات"
        onPress={() => {
          if (!d.names.length) return Alert.alert('أضف الأسماء', 'أضف أسماء الطلاب أول عشان تقدر ترصد درجاتهم.');
          store.update((x) => { x.data.setup = true; });
          store.flush();
          onDone();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  theme: { width: '31%', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.line, backgroundColor: '#fff' },
  themeOn: { borderColor: colors.brand },
  swatches: { flexDirection: 'row', width: '100%', height: 24, borderRadius: 6, overflow: 'hidden' },
  group: { gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { width: 56, textAlign: 'center', paddingHorizontal: 4 },
  numLabel: { width: 56, textAlign: 'center', fontSize: 12 },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: colors.brandLight },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
  step: { fontSize: 18, color: colors.brandDark },
});
