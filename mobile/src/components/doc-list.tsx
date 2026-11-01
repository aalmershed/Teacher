import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Empty, ErrorBox, Loading, Text, fmtDate } from '@/components/ui';
import { api, type DocSummary } from '@/lib/api';
import { colors, radius } from '@/theme';

type Props = {
  path: string;          // مثل /api/projects
  listKey: string;       // مفتاح القائمة في الرد
  icon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyHint: string;
};

// قائمة مستندات المعلم (ملفات الإنجاز، الشهادات، الكشوف) — تتحدث عند فتح الشاشة وبالسحب للأسفل
export function DocList({ path, listKey, icon, emptyTitle, emptyHint }: Props) {
  const [items, setItems] = useState<DocSummary[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Record<string, DocSummary[]>>('GET', path);
      setItems(r[listKey]);
      setError('');
    } catch (e: any) {
      setError(e.message);
      setItems((prev) => prev ?? []);
    }
  }, [path, listKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!items) return <Loading />;

  return (
    <FlatList
      data={items}
      keyExtractor={(it) => String(it.id)}
      contentContainerStyle={[styles.list, !items.length && { flex: 1 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      ListHeaderComponent={<ErrorBox message={error} />}
      ListEmptyComponent={error ? undefined : <Empty title={emptyTitle} hint={emptyHint} />}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          onPress={() => Alert.alert(item.title, 'التعديل من التطبيق جاي في التحديث القادم.')}
        >
          <View style={styles.icon}><Ionicons name={icon} size={22} color={colors.brandDark} /></View>
          <View style={{ flex: 1 }}>
            <Text weight="bold" style={{ fontSize: 16 }} numberOfLines={1}>{item.title}</Text>
            <Text muted style={{ fontSize: 13 }}>آخر تعديل: {fmtDate(item.updated_at)}</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 14,
  },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
});
