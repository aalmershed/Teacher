import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { colors, fonts } from '@/theme';

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brandDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ملفاتي', tabBarIcon: icon('folder-open-outline') }} />
      <Tabs.Screen name="schedule" options={{ title: 'جدولي', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="certificates" options={{ title: 'الشهادات', tabBarIcon: icon('ribbon-outline') }} />
      <Tabs.Screen name="sheets" options={{ title: 'الكشوف', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'حسابي', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
