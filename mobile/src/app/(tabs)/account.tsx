import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, ErrorBox, Input, Text, fmtDate } from '@/components/ui';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';


export default function Account() {
  const { user, logout, refresh } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // حالة التنزيل قد تتغير من الموقع، فنحدّثها كل ما فتح الشاشة
  useFocusEffect(useCallback(() => { refresh().catch(() => {}); }, [refresh]));

  if (!user) return null;
  const sub = user.subscription;

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await api<{ user: User }>('PUT', '/api/me', { phone, currentPassword, newPassword });
      await refresh();
      setCurrent('');
      setNew('');
      Alert.alert('تم الحفظ', newPassword ? 'تم تحديث بياناتك وكلمة المرور.' : 'تم تحديث بياناتك.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // حذف الحساب من داخل التطبيق (تشترطه Apple) — بتأكيدين: تحذير ثم كلمة المرور
  const deleteAccount = async (password: string) => {
    setDeleting(true);
    try {
      await api('DELETE', '/api/me', { password });
      await logout();
      Alert.alert('تم حذف الحساب', 'انحذف حسابك وكل ملفاتك نهائيًا.');
    } catch (e: any) {
      Alert.alert('تعذر حذف الحساب', e.message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('حذف الحساب نهائيًا', 'بينحذف حسابك وكل ملفات الإنجاز والشهادات والكشوف والصور والشواهد من التطبيق والموقع، وما تقدر ترجعها.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'متابعة', style: 'destructive',
        onPress: () => Alert.prompt(
          'تأكيد الحذف', 'اكتب كلمة المرور للتأكيد',
          [{ text: 'إلغاء', style: 'cancel' }, { text: 'احذف حسابي', style: 'destructive', onPress: (p?: string) => deleteAccount(p || '') }],
          'secure-text',
        ),
      },
    ]);

  const confirmLogout = () =>
    Alert.alert('تسجيل الخروج', 'متأكد تبي تطلع من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout },
    ]);

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Card>
          <Text weight="extraBold" style={{ fontSize: 20 }}>{user.name}</Text>
          <Text muted>{user.email}</Text>
        </Card>

        <Card>
          {/* نسخة App Store تعرض حالة الحساب فقط بدون بيع أو توجيه للدفع (قوانين Apple) */}
          <Text weight="bold" style={styles.section}>تنزيل ملفات PDF</Text>
          {sub.active || user.isAdmin ? (
            <View style={[styles.badge, { backgroundColor: colors.brandLight }]}>
              <Text weight="bold" style={{ color: colors.brandDark }}>
                مفعّل{sub.endsAt && !user.isAdmin ? ` حتى ${fmtDate(sub.endsAt)}` : ''}
              </Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: colors.bg }]}>
              <Text weight="bold" style={{ color: colors.muted }}>غير مفعّل لحسابك</Text>
            </View>
          )}
        </Card>

        <Card>
          <Text weight="bold" style={styles.section}>بياناتي</Text>
          <ErrorBox message={error} />
          <Input label="رقم الجوال" ltr value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xxxxxxxx" />
          <Input label="كلمة المرور الحالية" ltr value={currentPassword} onChangeText={setCurrent} secureTextEntry textContentType="password" placeholder="مطلوبة فقط لتغيير كلمة المرور" />
          <Input label="كلمة المرور الجديدة" ltr value={newPassword} onChangeText={setNew} secureTextEntry textContentType="newPassword" autoComplete="new-password" />
          <Button title="حفظ" onPress={save} loading={saving} />
        </Card>

        <Button title="تسجيل الخروج" variant="outline" onPress={confirmLogout} />
        <Button title="حذف الحساب" variant="danger" onPress={confirmDelete} loading={deleting} />
        <Text muted style={{ fontSize: 12, textAlign: 'center' }}>حذف الحساب يحذف كل ملفاتك وشهاداتك وكشوفك وصورك نهائيًا من التطبيق والموقع.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  section: { fontSize: 16, marginBottom: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
