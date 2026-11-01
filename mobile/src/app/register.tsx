import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Card, ErrorBox, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('التسجيل مجاني: أنشئ ملفك وعدّله بدون دفع، واشترك فقط عند تنزيله PDF.');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<{ trialDays: number }>('GET', '/api/plans')
      .then(({ trialDays }) => { if (trialDays > 0) setNote(`تحصل على فترة تجريبية مجانية لمدة ${trialDays} أيام فور التسجيل.`); })
      .catch(() => {});
  }, []);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await register(form);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Card>
          <ErrorBox message={error} />
          <Input label="الاسم الكامل" value={form.name} onChangeText={set('name')} placeholder="مثال: نورة السبيعي" autoComplete="name" textContentType="name" />
          <Text muted style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>يظهر الاسم في ملفاتك، ولا يمكن تعديله لاحقًا إلا عن طريق الدعم.</Text>
          <Input label="البريد الإلكتروني" ltr value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          <Input label="رقم الجوال (اختياري)" ltr value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="05xxxxxxxx" autoComplete="tel" textContentType="telephoneNumber" />
          <Input label="كلمة المرور" ltr value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="8 أحرف على الأقل" />
          <Button title="إنشاء الحساب" onPress={submit} loading={loading} />
          <Text muted style={{ fontSize: 13, marginTop: 14 }}>{note}</Text>
        </Card>
      </ScrollView>
    </>
  );
}
