import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Field } from '@/components/blocks/basic';
import { Labeled } from '@/components/doc-fields';
import { DocPreview } from '@/components/doc-preview';
import { PdfButton } from '@/components/pdf-button';
import { SaveBadge } from '@/components/editor-common';
import { SheetGrades } from '@/components/sheet/grades';
import { SheetSetup } from '@/components/sheet/setup';
import { Card, Empty, Loading, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { pageCount, sheetStore as store, type Group, type SheetTheme } from '@/lib/sheet-store';
import { colors } from '@/theme';

export default function SheetEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { doc, meta, status, error, rev } = store.useStore();
  const [mode, setMode] = useState<'setup' | 'grades' | null>(null);
  const [page, setPage] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    store.open(Number(id));
    return () => { store.close(); };
  }, [id]);

  if (status === 'error' && !doc) return <><Stack.Screen options={{ title: '' }} /><Empty title="تعذر فتح الكشف" hint={error} /></>;
  if (!doc) return <Loading />;

  const d = doc.data;
  // أول ما يفتح: إذا الإعدادات محفوظة وفيه أسماء يروح على طول لرصد الدرجات (مثل الموقع)
  const current = mode ?? (d.setup && d.names.length ? 'grades' : 'setup');
  const pages = pageCount(d);
  const shown = Math.min(page, pages - 1);
  const watermark = !(user?.isAdmin || user?.subscription.active);
  const go = (m: 'setup' | 'grades') => { setMode(m); scroll.current?.scrollTo({ y: 0, animated: false }); };

  return (
    <>
      <Stack.Screen options={{ title: doc.title || 'كشف متابعة', headerRight: () => <SaveBadge status={status} /> }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView ref={scroll} contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          {current === 'setup' ? (
            <>
              <View style={styles.pv}>
                <DocPreview renderer="SheetRender" data={d} options={{ page: shown, watermark }} />
                {pages > 1 ? (
                  <View style={styles.nav}>
                    <Pressable onPress={() => setPage(Math.max(0, shown - 1))} style={styles.navBtn}><Text weight="bold">→</Text></Pressable>
                    <Text weight="bold" style={{ writingDirection: 'ltr' }}>{shown + 1} / {pages}</Text>
                    <Pressable onPress={() => setPage(Math.min(pages - 1, shown + 1))} style={styles.navBtn}><Text weight="bold">←</Text></Pressable>
                  </View>
                ) : null}
                <PdfButton path={`/api/sheets/${id}/pdf`} name={`${doc.title || 'كشف-متابعة'}.pdf`} before={store.flush} />
              </View>
              <Card>
                <Labeled label="اسم الكشف (يظهر في قائمتك)">
                  <Field value={doc.title} onChangeText={(v) => store.update((x) => { x.title = v; })} maxLength={100} />
                </Labeled>
              </Card>
              <SheetSetup d={d} themes={(meta.themes || []) as SheetTheme[]} defaults={(meta.defaultGroups || []) as Group[]} rev={rev} onDone={() => go('grades')} />
            </>
          ) : (
            <SheetGrades d={d} rev={rev} id={id} title={doc.title} onEditSetup={() => go('setup')} />
          )}
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
});
