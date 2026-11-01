import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from '@/lib/api';
import { colors } from '@/theme';
import { previewPage } from './doc-preview-page';

// معاينة الشهادة أو الكشف بنفس كود الرسم اللي يستخدمه الموقع والـPDF (cert-render.js / sheet-render.js)،
// فالمعاينة في التطبيق مطابقة للملف النهائي. الصفحة A4 أفقية (1123×794) تُصغّر لعرض الشاشة.
export type Props = { renderer: 'CertRender' | 'SheetRender'; data: unknown; options?: Record<string, unknown> };



export function DocPreview({ renderer, data, options }: Props) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [source] = useState(() => ({ html: previewPage(renderer), baseUrl: API_URL }));

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
