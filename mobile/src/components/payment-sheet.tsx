import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Text } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { colors } from '@/theme';

// نموذج الدفع من ميسر (مدى، فيزا، ماستركارد...) — نفس نموذج الموقع ومن نفس الخادم.
// بعد الدفع يرجّع ميسر الصفحة لرابط التحقق في الخادم، والخادم يتحقق من العملية بالمفتاح السري
// ثم يحوّل إلى /subscribe?pay=success أو failed، فنلتقط هذا التحويل ونقفل النموذج.
export type MoyasarForm = { amount: number; description: string } & Record<string, unknown>;
export type PayResult = { ok: boolean; message?: string };

const page = (form: MoyasarForm) => `<!doctype html><html dir="rtl" lang="ar"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="/vendor/moyasar/moyasar.css">
<style>body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif;background:#fff;color:${colors.ink}}
h3{margin:0 0 4px;font-size:17px}.amt{color:${colors.muted};margin:0 0 16px}</style>
</head><body>
<h3 id="t"></h3><p class="amt" id="a"></p>
<div class="mysr-form"></div>
<script src="/vendor/moyasar/moyasar.umd.js"></script>
<script>
  const form = ${JSON.stringify(form)};
  document.getElementById('t').textContent = form.description;
  document.getElementById('a').textContent = 'المبلغ: ' + (form.amount / 100).toFixed(2) + ' ر.س';
  try { Moyasar.init(Object.assign({ element: '.mysr-form', language: 'ar' }, form)); }
  catch (e) { document.body.insertAdjacentHTML('beforeend', '<p>تعذر تحميل نموذج الدفع</p>'); }
</script></body></html>`;

export function PaymentSheet({ form, onClose }: { form: MoyasarForm | null; onClose: (r: PayResult | null) => void }) {
  const [loading, setLoading] = useState(true);

  // يلتقط رجوع الخادم بعد التحقق من الدفع
  const handle = (url: string) => {
    // تحليل يدوي للرابط: URL في React Native ناقص في بعض الإصدارات
    const m = /^https?:\/\/[^/?#]+\/subscribe\?([^#]*)/.exec(url);
    if (!m) return true;
    const q: Record<string, string> = {};
    m[1].split('&').forEach((kv) => {
      const [k, v = ''] = kv.split('=');
      try { q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* تجاهل */ }
    });
    if (q.pay === 'success') onClose({ ok: true });
    else if (q.pay === 'failed') onClose({ ok: false, message: q.msg || '' });
    else return true;
    return false;
  };

  return (
    <Modal visible={!!form} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['bottom']}>
        <View style={styles.head}>
          <Text weight="extraBold" style={{ fontSize: 17 }}>إتمام الدفع</Text>
          <Pressable onPress={() => onClose(null)} hitSlop={10}><Text weight="bold" style={{ color: colors.brandDark }}>إلغاء</Text></Pressable>
        </View>
        {form ? (
          <WebView
            source={{ html: page(form), baseUrl: API_URL }}
            originWhitelist={['*']}
            onLoadEnd={() => setLoading(false)}
            onShouldStartLoadWithRequest={(r) => handle(r.url)}
            style={{ flex: 1 }}
          />
        ) : null}
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.brand} size="large" /></View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', top: 60 },
});
