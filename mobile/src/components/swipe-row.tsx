import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

// سحب البطاقة لليسار للحذف بأسلوب iOS:
// - لوحة حمراء بارتفاع البطاقة تكبر مع الإصبع، والأيقونة تظهر وتكبر تدريجيًا
// - اهتزاز خفيف لما ينفتح زر الحذف، واهتزاز أقوى عند السحب الكامل
// - السحب الكامل لليسار يفتح تأكيد الحذف مباشرة
// - فتح بطاقة يقفل أي بطاقة ثانية مفتوحة
const ACTION_W = 92;      // عرض زر الحذف وهو مفتوح
const FULL_SWIPE = 190;    // مسافة السحب الكامل

let openRow: SwipeableMethods | null = null;
const tap = (style: Haptics.ImpactFeedbackStyle) => { Haptics.impactAsync(style).catch(() => {}); };

function DeleteAction({ translation, armed, onPress }: { translation: SharedValue<number>; armed: SharedValue<boolean>; onPress: () => void }) {
  const opened = useSharedValue(false);

  // الاهتزاز عند تجاوز حد الفتح وحد السحب الكامل (مرة وحدة لكل تجاوز)
  useAnimatedReaction(() => -translation.get(), (d) => {
    const isOpen = d > ACTION_W * 0.65;
    if (isOpen !== opened.get()) { opened.set(isOpen); if (isOpen) scheduleOnRN(tap, Haptics.ImpactFeedbackStyle.Light); }
    const isFull = d > FULL_SWIPE;
    if (isFull !== armed.get()) { armed.set(isFull); if (isFull) scheduleOnRN(tap, Haptics.ImpactFeedbackStyle.Medium); }
  });

  const panel = useAnimatedStyle(() => {
    const d = Math.max(0, -translation.get());
    return {
      width: Math.max(ACTION_W, d),
      opacity: interpolate(d, [0, 24, ACTION_W * 0.6], [0, 0.6, 1], Extrapolation.CLAMP),
      // عند السحب الكامل تلتصق الأيقونة بطرف البطاقة مثل iOS
      alignItems: armed.get() ? 'flex-start' : 'center',
    };
  });
  const iconStyle = useAnimatedStyle(() => {
    const d = Math.max(0, -translation.get());
    const s = interpolate(d, [0, ACTION_W], [0.4, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: armed.get() ? 1.15 : s }], opacity: interpolate(d, [10, ACTION_W * 0.7], [0, 1], Extrapolation.CLAMP) };
  });

  return (
    <Animated.View style={[styles.panel, panel]}>
      <Pressable onPress={onPress} style={styles.hit} accessibilityRole="button" accessibilityLabel="حذف">
        <Animated.View style={[styles.inner, iconStyle]}>
          <Ionicons name="trash" size={22} color="#fff" />
          <Text weight="bold" style={styles.label}>حذف</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function SwipeToDelete({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const ref = useRef<SwipeableMethods>(null);
  const armed = useSharedValue(false);

  const del = () => { ref.current?.close(); onDelete(); };

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.4}
      rightThreshold={ACTION_W / 2}
      overshootRight
      overshootFriction={4}
      containerStyle={styles.container}
      onSwipeableWillOpen={() => { if (openRow && openRow !== ref.current) openRow.close(); openRow = ref.current; }}
      onSwipeableOpen={() => { if (armed.get()) { armed.set(false); tap(Haptics.ImpactFeedbackStyle.Heavy); del(); } }}
      onSwipeableClose={() => { if (openRow === ref.current) openRow = null; }}
      renderRightActions={(_p, translation) => <DeleteAction translation={translation} armed={armed} onPress={del} />}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius },
  panel: {
    height: '100%', justifyContent: 'center', backgroundColor: colors.danger,
    borderRadius: radius, marginStart: 8, paddingHorizontal: 22,
  },
  hit: { flex: 1, justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 2 },
  label: { color: '#fff', fontSize: 12 },
});
