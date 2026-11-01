import { Link } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ErrorBox, Input, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.brand}>
            <View style={styles.mark}><Text weight="extraBold" style={styles.markText}>م</Text></View>
            <Text weight="extraBold" style={styles.title}>مركز المعلم</Text>
            <Text muted style={{ textAlign: 'center' }}>ملف إنجازك وشهاداتك وكشوف طلابك في مكان واحد</Text>
          </View>

          <Card>
            <ErrorBox message={error} />
            <Input
              label="البريد الإلكتروني" ltr value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
              returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()}
            />
            <Input
              ref={passRef} label="كلمة المرور" ltr value={password} onChangeText={setPassword}
              secureTextEntry autoComplete="current-password" textContentType="password"
              returnKeyType="go" onSubmitEditing={submit}
            />
            <Link href="/forgot" style={styles.forgot}>
              <Text weight="bold" style={{ color: colors.brandDark }}>نسيت كلمة المرور؟</Text>
            </Link>
            <Button title="دخول" onPress={submit} loading={loading} />
          </Card>

          <View style={styles.footer}>
            <Text muted>ما عندك حساب؟</Text>
            <Link href="/register"><Text weight="bold" style={{ color: colors.brandDark }}>سجّل مجانًا</Text></Link>
          </View>
        </ScrollView>
      </>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  brand: { alignItems: 'center', marginBottom: 24, gap: 6 },
  mark: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  markText: { color: '#fff', fontSize: 32, lineHeight: 40 },
  title: { fontSize: 26 },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 },
});
