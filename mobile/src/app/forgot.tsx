import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Card, ErrorBox, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/theme';

export default function Forgot() {
  const [info, setInfo] = useState<{ email: boolean; contact: string } | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ email: boolean; contact: string }>('GET', '/api/auth/forgot')
      .then(setInfo)
      .catch((e) => { setInfo({ email: false, contact: '' }); setError(e.message); });
  }, []);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await api('POST', '/api/auth/forgot', { email });
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!info) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Card>
        <ErrorBox message={error} />
        {sent ? (
          <Text style={{ color: colors.ok }}>إذا كان البريد مسجلًا عندنا، بتوصلك رسالة فيها رابط لتعيين كلمة مرور جديدة. الرابط صالح لمدة ساعة.</Text>
        ) : info.email ? (
          <>
            <Text muted style={{ marginBottom: 14 }}>اكتب بريدك المسجل وبنرسل لك رابط لتعيين كلمة مرور جديدة.</Text>
            <Input label="البريد الإلكتروني" ltr value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Button title="أرسل الرابط" onPress={submit} loading={loading} />
          </>
        ) : (
          <Text>
            استعادة كلمة المرور بالبريد غير متاحة حاليًا.
            {info.contact ? ` تواصل معنا لإعادة تعيينها: ${info.contact}` : ' تواصل مع الدعم لإعادة تعيينها.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}
