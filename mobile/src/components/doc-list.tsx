import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Button, Empty, ErrorBox, Loading, Text, fmtDate } from '@/components/ui';
import { api, type DocSummary } from '@/lib/api';
import { downloadPdf } from '@/lib/pdf';
import { colors, radius } from '@/theme';

type Props = {
  path: string;          // مثل /api/projects
  listKey: string;       // مفتاح القائمة في الرد
  icon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyHint: string;
  newLabel: string;
  onNew: () => void;
  onOpen: (item: DocSummary) => void;
  extra?: (item: DocSummary) => { label: string; onPress: () => void }[];
};

// يعرض قائمة خيارات أصلية (Action Sheet في الآيفون)
export function chooseAction(title: string, options: { label: string; destructive?: boolean; onPress: () => void }[]) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), 'إلغاء'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: options.findIndex((o) => o.destructive) },
      (i) => { if (i < options.length) options[i].onPress(); },
    );
  } else {
    Alert.alert(title, undefined, [...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? 'destructive' as const : 'default' as const })), { text: 'إلغاء', style: 'cancel' }]);
  }
}

// قائمة مستندات المعلم (ملفات الإنجاز، الشهادات، الكشوف) — تتحدث عند فتح الشاشة وبالسحب للأسفل
export function DocList({ path, listKey, icon, emptyTitle, emptyHint, newLabel, onNew, onOpen, extra }: Props) {
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

  const duplicate = async (item: DocSummary) => {
    try { await api('POST', `${path}/${item.id}/duplicate`); await load(); } catch (e: any) { Alert.alert('تعذر النسخ', e.message); }
  };

  const remove = (item: DocSummary) =>
    Alert.alert('تأكيد الحذف', `متأكد تبي تحذف «${item.title}»؟ ما تقدر ترجعه بعد الحذف.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'احذف', style: 'destructive',
        onPress: async () => {
          try { await api('DELETE', `${path}/${item.id}`); setItems((xs) => (xs || []).filter((x) => x.id !== item.id)); } catch (e: any) { Alert.alert('تعذر الحذف', e.message); }
        },
      },
    ]);

  const menu = (item: DocSummary) => chooseAction(item.title, [
    { label: 'فتح وتعديل', onPress: () => onOpen(item) },
    ...(extra ? extra(item) : []),
    { label: 'تنزيل PDF', onPress: () => downloadPdf(`${path}/${item.id}/pdf`, `${item.title}.pdf`) },
    { label: 'نسخ', onPress: () => duplicate(item) },
    { label: 'حذف', destructive: true, onPress: () => remove(item) },
  ]);

  if (!items) return <Loading />;

  return (
    <FlatList showsVerticalScrollIndicator={false}
      data={items}
      keyExtractor={(it) => String(it.id)}
      contentContainerStyle={[styles.list, !items.length && { flexGrow: 1 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      ListHeaderComponent={<><ErrorBox message={error} /><Button title={`＋ ${newLabel}`} onPress={onNew} style={{ marginBottom: 4 }} /></>}
      ListEmptyComponent={error ? undefined : <Empty title={emptyTitle} hint={emptyHint} />}
      renderItem={({ item }) => (
        // اسحب البطاقة لليسار يطلع زر حذف (مثل تطبيق الملاحظات)، والحذف نفسه يطلب تأكيد
        <ReanimatedSwipeable
          friction={1.6}
          rightThreshold={40}
          overshootRight={false}
          renderRightActions={(_p, _t, methods) => (
            <Pressable style={styles.swipeAction} onPress={() => { methods.close(); remove(item); }} accessibilityLabel={`حذف ${item.title}`}>
              <View style={styles.swipeBtn}><Ionicons name="trash-outline" size={24} color="#fff" /></View>
              <Text weight="bold" style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>حذف</Text>
            </Pressable>
          )}
        >
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => onOpen(item)}
            onLongPress={() => menu(item)}
          >
            <View style={styles.icon}><Ionicons name={icon} size={22} color={colors.brandDark} /></View>
            <View style={{ flex: 1 }}>
              <Text weight="bold" style={{ fontSize: 16 }} numberOfLines={1}>{item.title}</Text>
              <Text muted style={{ fontSize: 13 }}>آخر تعديل: {fmtDate(item.updated_at)}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => menu(item)} accessibilityLabel="خيارات">
              <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.muted} />
            </Pressable>
          </Pressable>
        </ReanimatedSwipeable>
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
  swipeAction: { width: 86, alignItems: 'center', justifyContent: 'center' },
  swipeBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f2545b', alignItems: 'center', justifyContent: 'center' },
});
