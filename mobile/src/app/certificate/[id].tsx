import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Field } from '@/components/blocks/basic';
import { Labeled, LogoPicker, NamesInput, Section, docStyles } from '@/components/doc-fields';
import { DocPreview } from '@/components/doc-preview';
import { SaveBadge } from '@/components/editor-common';
import { Card, Empty, Loading, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { certificateStore as store, type CertificateData, type Design } from '@/lib/certificate-store';
import { colors } from '@/theme';

export default function CertificateEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { doc, meta, status, error, rev } = store.useStore();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    store.open(Number(id));
    return () => { store.close(); };
  }, [id]);

  if (status === 'error' && !doc) return <><Stack.Screen options={{ title: '' }} /><Empty title="تعذر فتح الشهادة" hint={error} /></>;
  if (!doc) return <Loading />;

  const d = doc.data;
  const designs: Design[] = meta.designs || [];
  const names = d.names.length ? d.names : [''];
  const shown = Math.min(index, names.length - 1);
  const set = <K extends keyof CertificateData>(k: K, v: CertificateData[K]) => store.update((x) => { x.data[k] = v as any; });
  const watermark = !(user?.isAdmin || user?.subscription.active);

  return (
    <>
      <Stack.Screen options={{ title: doc.title || 'شهادة', headerRight: () => <SaveBadge status={status} /> }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.pv}>
            <DocPreview renderer="CertRender" data={d} options={{ index: shown, watermark }} />
            {names.length > 1 ? (
              <View style={styles.nav}>
                <Pressable onPress={() => setIndex(Math.max(0, shown - 1))} style={styles.navBtn}><Text weight="bold">→</Text></Pressable>
                <Text weight="bold" style={{ writingDirection: 'ltr' }}>{shown + 1} / {names.length}</Text>
                <Pressable onPress={() => setIndex(Math.min(names.length - 1, shown + 1))} style={styles.navBtn}><Text weight="bold">←</Text></Pressable>
              </View>
            ) : null}
          </View>

          <Card style={{ gap: 18 }}>
            <Labeled label="اسم الشهادة (يظهر في قائمتك)">
              <Field value={doc.title} onChangeText={(v) => store.update((x) => { x.title = v; })} maxLength={100} />
            </Labeled>

            <Section title="التصميم">
              <View style={styles.designs}>
                {designs.map((ds) => (
                  <Pressable key={ds.id} onPress={() => set('design', ds.id)} style={[styles.design, d.design === ds.id && styles.designOn]}>
                    <View style={styles.swatches}>{ds.colors.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}</View>
                    <Text weight={d.design === ds.id ? 'bold' : 'regular'} style={{ fontSize: 13 }}>{ds.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            <Section title="نص الشهادة">
              <Labeled label="العنوان"><Field value={d.title} onChangeText={(v) => set('title', v)} maxLength={80} /></Labeled>
              <Labeled label="السطر الأول"><Field value={d.intro} onChangeText={(v) => set('intro', v)} maxLength={300} placeholder="مثال: تتقدم مدرسة حفصة بنت عمر" /></Labeled>
              <Labeled label="السطر الثاني"><Field value={d.lead} onChangeText={(v) => set('lead', v)} maxLength={300} placeholder="مثال: بالشكر والتقدير للطالبة المتميزة" /></Labeled>
              <Labeled
                label="الاسم (أو عدة أسماء)"
                hint={names.filter(Boolean).length > 1 ? `بيتسوى ${names.filter(Boolean).length} شهادات في ملف PDF واحد.` : 'اكتب كل اسم في سطر، وتتسوى شهادة لكل اسم في ملف واحد.'}
              >
                <NamesInput key={rev} names={d.names} onChange={(v) => set('names', v)} />
              </Labeled>
              <Labeled label="نص التكريم">
                <Field value={d.body} onChangeText={(v) => set('body', v)} multiline maxLength={1200} style={{ minHeight: 110, textAlignVertical: 'top' }} />
              </Labeled>
              <Labeled label="التاريخ (اختياري)"><Field value={d.date} onChangeText={(v) => set('date', v)} maxLength={80} placeholder="مثال: تحريرًا في 15 / 4 / 1448هـ" /></Labeled>
            </Section>

            <Section title="التوقيعات">
              <View style={docStyles.row2}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text weight="bold" style={{ fontSize: 14 }}>التوقيع الأيمن</Text>
                  <Field value={d.sign1.label} onChangeText={(v) => store.update((x) => { x.data.sign1.label = v; })} maxLength={60} placeholder="الصفة: المعلمة" />
                  <Field value={d.sign1.name} onChangeText={(v) => store.update((x) => { x.data.sign1.name = v; })} maxLength={80} placeholder="الاسم" />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text weight="bold" style={{ fontSize: 14 }}>التوقيع الأيسر</Text>
                  <Field value={d.sign2.label} onChangeText={(v) => store.update((x) => { x.data.sign2.label = v; })} maxLength={60} placeholder="الصفة: مديرة المدرسة" />
                  <Field value={d.sign2.name} onChangeText={(v) => store.update((x) => { x.data.sign2.name = v; })} maxLength={80} placeholder="الاسم" />
                </View>
              </View>
            </Section>

            <Section title="الشعارات (اختياري)">
              <View style={docStyles.row2}>
                <LogoPicker label="الشعار الأيمن" value={d.logoRight} onChange={(v) => set('logoRight', v)} />
                <LogoPicker label="الشعار الأيسر" value={d.logoLeft} onChange={(v) => set('logoLeft', v)} />
              </View>
              <Text muted style={{ fontSize: 12 }}>ارفع شعار مدرستك أو أي شعار عندك حق استخدامه (PNG بخلفية شفافة يعطي أفضل نتيجة).</Text>
            </Section>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 60 },
  pv: { backgroundColor: '#e9ece9', borderRadius: 16, padding: 10, gap: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  navBtn: { backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 4 },
  designs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  design: { width: '31%', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.line, backgroundColor: '#fff' },
  designOn: { borderColor: colors.brand },
  swatches: { flexDirection: 'row', width: '100%', height: 28, borderRadius: 6, overflow: 'hidden' },
});

