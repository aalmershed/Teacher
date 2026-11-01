import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, useFonts } from '@expo-google-fonts/tajawal';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

SplashScreen.preventAutoHideAsync();

// أي خطأ غير متوقع في شاشة يعرض رسالة مع زر إعادة المحاولة بدل ما يقفل التطبيق
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { SplashScreen.hideAsync(); }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>صار خطأ غير متوقع</Text>
      <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>بياناتك محفوظة. جرّب مرة ثانية، ولو تكرر الخطأ صوّر الشاشة وأرسلها للدعم.</Text>
      <Text selectable style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>حاول مرة ثانية</Text>
      </Pressable>
    </View>
  );
}

function RootStack() {
  const { user, ready } = useAuth();
  const [fontsLoaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brandDark,
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'الرئيسية' }} />
        <Stack.Screen name="project/new" options={{ title: 'ملف إنجاز جديد', presentation: 'modal' }} />
        <Stack.Screen name="project/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="project/[id]/add-page" options={{ title: 'إضافة صفحة', presentation: 'modal' }} />
        <Stack.Screen name="project/[id]/page/[pageId]" options={{ title: '' }} />
        <Stack.Screen name="certificate/[id]" options={{ title: '' }} />
        <Stack.Screen name="sheet/[id]" options={{ title: '' }} />
        <Stack.Screen name="project/[id]/preview" options={{ title: 'معاينة' }} />
        <Stack.Screen name="subscribe" options={{ title: 'الاشتراك', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'حساب جديد' }} />
        <Stack.Screen name="forgot" options={{ title: 'نسيت كلمة المرور' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
