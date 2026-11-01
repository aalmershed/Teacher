import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, ErrorBox, Input, Text, fmtDate } from '@/components/ui';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

const PLAN_NAMES: Record<string, string> = { monthly: 'شهري', yearly: 'سنوي' };

export default function Account() {
  const { user, logout, refresh } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // حالة الاشتراك قد تتغير من الموقع، فنحدّثها كل ما فتح الشاشة
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

  const confirmLogout = () =>
    Alert.alert('تسجيل الخروج', 'متأكد تبي تطلع من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: logout },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card>
          <Text weight="extraBold" style={{ fontSize: 20 }}>{user.name}</Text>
          <Text muted>{user.email}</Text>
        </Card>

        <Card>
          <Text weight="bold" style={styles.section}>الاشتراك</Text>
          {sub.active ? (
            <View style={[styles.badge, { backgroundColor: colors.brandLight }]}>
              <Text weight="bold" style={{ color: colors.brandDark }}>
                مشترك{sub.plan && PLAN_NAMES[sub.plan] ? ` (${PLAN_NAMES[sub.plan]})` : ''}
                {sub.endsAt ? ` حتى ${fmtDate(sub.endsAt)}` : ''}
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.badge, { backgroundColor: colors.accentLight }]}>
                <Text weight="bold" style={{ color: colors.accent }}>غير مشترك</Text>
              </View>
              <Text muted style={{ marginTop: 8 }}>تقدر تسوي ملفاتك وتعدّلها مجانًا. الاشتراك مطلوب لتنزيل ملفات PDF فقط.</Text>
            </>
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

        <Button title="تسجيل الخروج" variant="danger" onPress={confirmLogout} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  section: { fontSize: 16, marginBottom: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
