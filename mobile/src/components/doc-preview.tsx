import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from '@/lib/api';
import { colors } from '@/theme';

// معاينة الشهادة أو الكشف بنفس كود الرسم اللي يستخدمه الموقع والـPDF (cert-render.js / sheet-render.js)،
// فالمعاينة في التطبيق مطابقة للملف النهائي. الصفحة A4 أفقية (1123×794) تُصغّر لعرض الشاشة.
type Props = { renderer: 'CertRender' | 'SheetRender'; data: unknown; options?: Record<string, unknown> };

const SCRIPT = { CertRender: '/assets/js/cert-render.js', SheetRender: '/assets/js/sheet-render.js' };

const html = (renderer: Props['renderer']) => `<!doctype html><html dir="rtl"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;background:transparent;overflow:hidden}
#box{width:100vw;height:100vh;position:relative;overflow:hidden}
#pv{position:absolute;top:0;right:0;width:1123px;height:794px;border:0;transform-origin:top right;background:#fff}</style>
</head><body><div id="box"><iframe id="pv"></iframe></div>
<script src="${SCRIPT[renderer]}"></script>
<script>
  const pv = document.getElementById('pv');
  const fit = () => { pv.style.transform = 'scale(' + (innerWidth / 1123) + ')'; };
  addEventListener('resize', fit);
  window.show = (data, opts) => {
    pv.srcdoc = ${renderer}.render(data, Object.assign({ fontCss: '@import url(/assets/fonts.css);', imageUrl: (u) => '/i/' + u, screen: true }, opts));
    fit();
  };
  window.ReactNativeWebView.postMessage('ready');
</script></body></html>`;

export function DocPreview({ renderer, data, options }: Props) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [source] = useState(() => ({ html: html(renderer), baseUrl: API_URL }));

  // نعيد الرسم بعد توقف الكتابة بقليل، بدون إعادة تحميل الصفحة
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      ref.current?.injectJavaScript(`window.show(${JSON.stringify(data)}, ${JSON.stringify(options || {})}); true;`);
    }, 250);
    return () => clearTimeout(t);
  }, [ready, data, options]);

  return (
    <View style={[styles.frame, { height: width ? (width * 794) / 1123 : 200 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={source}
        scrollEnabled={false}
        onMessage={(e) => { if (e.nativeEvent.data === 'ready') setReady(true); }}
        style={{ backgroundColor: 'transparent' }}
      />
      {ready ? null : <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
