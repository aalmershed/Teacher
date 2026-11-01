import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { api } from '@/lib/api';
import type { SaveStatus } from '@/lib/project-store';
import type { Theme } from '@/lib/project-types';
import { colors } from '@/theme';

let themesCache: Theme[] | null = null;

export function useThemes() {
  const [themes, setThemes] = useState<Theme[]>(themesCache || []);
  useEffect(() => {
    if (themesCache) return;
    api<{ themes: Theme[] }>('GET', '/api/themes').then((r) => { themesCache = r.themes; setThemes(r.themes); }).catch(() => {});
  }, []);
  return themes;
}

// اختيار نمط الألوان — نفس ألوان الموقع (نعناعي، وردي، كحلي...)
export function ThemePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const themes = useThemes();
  if (!themes.length) return <ActivityIndicator color={colors.brand} />;
  return (
    <View style={styles.themes}>
      {themes.map((t) => (
        <Pressable key={t.id} onPress={() => onChange(t.id)} style={[styles.theme, value === t.id && styles.themeOn]}>
          <View style={styles.swatches}>
            {t.colors.map((c) => <View key={c} style={[styles.swatch, { backgroundColor: c }]} />)}
          </View>
          <Text weight={value === t.id ? 'bold' : 'regular'} style={{ fontSize: 13 }}>{t.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// اختيار من خيارين أو أكثر (مثل: صفحة واحدة / صفحتين)
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segBtn, value === o.value && styles.segOn]}>
          <Text weight="bold" style={{ fontSize: 14, color: value === o.value ? colors.ink : colors.muted }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const STATUS: Record<SaveStatus, { text: string; color: string }> = {
  loading: { text: '', color: colors.muted },
  saved: { text: 'محفوظ ✓', color: colors.ok },
  dirty: { text: 'تغييرات غير محفوظة', color: colors.muted },
  saving: { text: 'جارٍ الحفظ...', color: colors.muted },
  error: { text: 'تعذر الحفظ', color: colors.danger },
  conflict: { text: 'تغيّر من جهاز ثاني', color: colors.danger },
};

export function SaveBadge({ status }: { status: SaveStatus }) {
  const s = STATUS[status];
  return <Text style={{ color: s.color, fontSize: 13 }}>{s.text}</Text>;
}

export function Note({ children }: { children: string }) {
  return <View style={styles.note}><Text style={{ fontSize: 14, color: colors.brandDark }}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  theme: { alignItems: 'center', gap: 6, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.card },
  themeOn: { borderColor: colors.brand },
  swatches: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden' },
  swatch: { width: 14, height: 28 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.line },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  segOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  note: { backgroundColor: colors.brandLight, borderRadius: 12, padding: 12 },
});
