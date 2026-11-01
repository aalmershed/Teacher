import type { ComponentRef, Ref, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { colors, fonts, radius } from '@/theme';

type Weight = 'regular' | 'medium' | 'bold' | 'extraBold';

export function Text({ weight = 'regular', muted, style, ...props }: TextProps & { weight?: Weight; muted?: boolean }) {
  return <RNText {...props} style={[styles.text, { fontFamily: fonts[weight] }, muted && { color: colors.muted }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'accent' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const filled = variant === 'primary' || variant === 'accent';
  const bg = variant === 'primary' ? colors.brand : variant === 'accent' ? colors.accent : colors.card;
  const fg = filled ? '#fff' : variant === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: filled ? bg : variant === 'danger' ? colors.danger : colors.line },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text weight="bold" style={{ color: fg, fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

type InputProps = TextInputProps & { label: string; ltr?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> };

export function Input({ label, ltr, style, ref, ...props }: InputProps) {
  return (
    <View style={styles.field}>
      <Text weight="bold" style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor="#a5aba8"
        {...props}
        style={[styles.input, ltr && ({ writingDirection: 'ltr' } as TextStyle), style]}
      />
    </View>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <View style={styles.error}><Text style={{ color: colors.danger }}>{message}</Text></View>;
}

export function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.center}>
      <Text weight="bold" style={{ fontSize: 17, textAlign: 'center' }}>{title}</Text>
      {hint ? <Text muted style={{ textAlign: 'center', marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

export function fmtDate(v: string | number) {
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  text: { color: colors.ink, fontSize: 15, textAlign: 'auto' },
  card: {
    backgroundColor: colors.card, borderRadius: radius, padding: 16, borderWidth: 1, borderColor: colors.line,
    shadowColor: '#1e2826', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  button: { minHeight: 50, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  field: { marginBottom: 14, gap: 6 },
  label: { fontSize: 14 },
  input: {
    borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: fonts.regular, color: colors.ink,
  },
  error: { backgroundColor: colors.dangerLight, padding: 12, borderRadius: 10, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
