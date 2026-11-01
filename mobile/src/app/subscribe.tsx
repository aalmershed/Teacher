import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Field } from '@/components/blocks/basic';
import { PaymentSheet, type MoyasarForm } from '@/components/payment-sheet';
import { Button, Card, Loading, Text, fmtDate } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

type Plan = { id: string; name: string; price: number; days: number };
type Coupon = { code: string; label: string; prices: Record<string, { applies: boolean; final: number }> };
type Checkout = { done?: boolean; free?: boolean; provider?: string; form?: MoyasarForm };

const PLAN_NAMES: Record<string, string> = { monthly: 'شهري', yearly: 'سنوي' };

export default function Subscribe() {
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [currency, setCurrency] = useState('ر.س');
  const [sel, setSel] = useState('yearly');
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<MoyasarForm | null>(null);

  useEffect(() => {
    api<{ plans: Plan[]; currency: string }>('GET', '/api/plans')
      .then((d) => { setPlans(d.plans); setCurrency(d.currency); })
      .catch((e) => { setPlans([]); Alert.alert('تعذر تحميل الخطط', e.message); });
  }, []);

  if (!plans || !user) return <Loading />;
  const sub = user.subscription;
  const provider = sub.provider;
  const monthly = plans.find((p) => p.id === 'monthly');
  const finalPrice = (p: Plan) => (coupon?.prices[p.id]?.applies ? coupon.prices[p.id].final : p.price);
  const selected = plans.find((p) => p.id === sel);
  const free = !!selected && !!coupon && finalPrice(selected) === 0;

  const applyCoupon = async () => {
    if (!code.trim()) return;
    try {
      const c = await api<Coupon>('POST', '/api/coupons/check', { code: code.trim() });
      setCoupon(c);
      setCouponMsg({ text: `✓ تم تطبيق ${c.label}`, ok: true });
    } catch (e: any) {
      setCoupon(null);
      setCouponMsg({ text: e.message, ok: false });
    }
  };

  const success = async (text: string) => {
    await refresh().catch(() => {});
    Alert.alert('تم 🎉', text, [{ text: 'تمام', onPress: () => router.back() }]);
  };

  const pay = async () => {
    setBusy(true);
    try {
      const r = await api<Checkout>('POST', '/api/subscribe', { plan: sel, coupon: coupon ? coupon.code : '' });
      if (r.provider === 'moyasar' && r.form) setForm(r.form);
      else if (r.done) await success(r.free ? 'تم تفعيل اشتراكك مجانًا بكود الخصم.' : 'تم تفعيل الاشتراك بنجاح.');
    } catch (e: any) {
      Alert.alert('تعذر إتمام الطلب', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Card style={{ gap: 6 }}>
          {sub.active ? (
            <>
              <Text weight="bold" style={{ color: colors.brandDark }}>
                مشترك{sub.plan && PLAN_NAMES[sub.plan] ? ` (${PLAN_NAMES[sub.plan]})` : ''}{sub.endsAt ? ` حتى ${fmtDate(sub.endsAt)}` : ''}
              </Text>
              <Text muted style={{ fontSize: 13 }}>تقدر تجدد الحين، وتنضاف المدة على اشتراكك الحالي.</Text>
            </>
          ) : (
            <>
              <Text weight="bold" style={{ color: colors.accent }}>غير مشترك</Text>
              <Text muted style={{ fontSize: 13 }}>استخدام المنصة مجاني. اشترك عشان تنزّل ملفاتك PDF.</Text>
            </>
          )}
        </Card>

        {plans.map((p) => {
          const f = finalPrice(p);
          const discounted = f !== p.price;
          const on = p.id === sel;
          return (
            <Pressable key={p.id} onPress={() => setSel(p.id)} style={[styles.plan, on && styles.planOn]}>
              {discounted ? <View style={styles.off}><Text weight="bold" style={{ color: '#fff', fontSize: 12 }}>{coupon!.label}</Text></View> : null}
              <Text weight="extraBold" style={{ fontSize: 18 }}>{p.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text weight="extraBold" style={{ fontSize: 30, color: colors.brandDark }}>{f === 0 ? 'مجانًا' : f}</Text>
                {discounted ? <Text muted style={{ textDecorationLine: 'line-through' }}>{p.price}</Text> : null}
                {f === 0 ? null : <Text muted>{currency} / {p.id === 'yearly' ? 'سنة' : 'شهر'}</Text>}
              </View>
              <Text muted style={{ fontSize: 13 }}>
                {p.id === 'yearly' && monthly ? `توفير ${Math.round(100 - (p.price / (monthly.price * 12)) * 100)}% مقارنة بالشهري` : 'مرونة كاملة، جدّد متى ما تبي'}
              </Text>
            </Pressable>
          );
        })}

        <Card style={{ gap: 8 }}>
          <Text weight="bold">كود خصم (اختياري)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="اكتب الكود" style={{ flex: 1 }} returnKeyType="done" onSubmitEditing={applyCoupon} />
            <Button title="تطبيق" variant="outline" onPress={applyCoupon} style={{ minHeight: 44 }} />
          </View>
          {couponMsg.text ? <Text style={{ fontSize: 13, color: couponMsg.ok ? colors.ok : colors.danger }}>{couponMsg.text}</Text> : null}
        </Card>

        {provider === 'mock' ? <Text muted style={{ fontSize: 12, textAlign: 'center' }}>بوابة الدفع في الوضع التجريبي: يتفعّل الاشتراك مباشرة بدون دفع فعلي.</Text> : null}
        {provider === 'manual' ? <Text muted style={{ fontSize: 12, textAlign: 'center' }}>التفعيل حاليًا يدوي: تواصل معنا لإتمام الدفع، ويتفعّل اشتراكك على نفس الحساب.</Text> : null}

        <Button
          title={free ? 'تفعيل الاشتراك مجانًا' : provider === 'manual' ? 'طلب التفعيل' : 'متابعة الدفع'}
          onPress={pay} loading={busy}
        />
        <Text muted style={{ fontSize: 12, textAlign: 'center' }}>الدفع آمن عن طريق ميسر (مدى، فيزا، ماستركارد).</Text>
      </ScrollView>

      <PaymentSheet
        form={form}
        onClose={async (r) => {
          setForm(null);
          if (!r) return;
          if (r.ok) await success('تم الدفع وتفعيل اشتراكك. تقدر الحين تنزّل ملفاتك PDF.');
          else Alert.alert('لم تكتمل عملية الدفع', `${r.message ? r.message + '. ' : ''}ما تفعّل الاشتراك، تقدر تحاول مرة ثانية.`);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 40 },
  plan: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 2, borderColor: colors.line, padding: 16, gap: 4 },
  planOn: { borderColor: colors.brand, backgroundColor: '#f7fbfa' },
  off: { position: 'absolute', top: 12, end: 12, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
