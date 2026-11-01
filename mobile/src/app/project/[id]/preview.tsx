import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PdfButton } from '@/components/pdf-button';
import { Empty } from '@/components/ui';
import { API_URL, authHeaders } from '@/lib/api';
import { flush, useProjectState } from '@/lib/project-store';
import { colors } from '@/theme';

// صفحات المعاينة بعرض A4 (أو صفحتين متقابلتين)، فنصغّرها لعرض الشاشة مع إمكانية التكبير بالأصابع
const FIT = `(function () {
  var m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width,initial-scale=1,maximum-scale=4';
  document.head.appendChild(m);
  // العلامة المائية في التطبيق «نسخة معاينة» فقط، بدون دعوة للاشتراك (قوانين Apple)
  var st = document.createElement('style'); st.textContent = ".sheet::after{content:'نسخة معاينة'!important}"; document.head.appendChild(st);
  function fit() {
    var w = 0; document.querySelectorAll('.sheet').forEach(function (s) { w = Math.max(w, s.offsetWidth); });
    if (w) document.body.style.zoom = Math.min(1, window.innerWidth / (w + 16));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); else window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
})(); true;`;

export default function ProjectPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project } = useProjectState();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // نحفظ آخر التعديلات قبل ما نطلب المعاينة من الخادم
  useEffect(() => {
    flush().finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#8a8f94' }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'معاينة' }} />
      {error ? <Empty title="تعذر فتح المعاينة" hint={error} /> : ready ? (
        <WebView
          source={{ uri: `${API_URL}/api/projects/${id}/preview`, headers: authHeaders() }}
          injectedJavaScript={FIT}
          originWhitelist={['*']}
          style={{ backgroundColor: '#8a8f94' }}
          startInLoadingState
          renderLoading={() => <View style={styles.loading}><ActivityIndicator color="#fff" size="large" /></View>}
          onHttpError={(e) => setError(e.nativeEvent.statusCode === 401 ? 'انتهت الجلسة، سجّل دخول من جديد.' : 'حدث خطأ في الخادم.')}
          onError={() => setError('تعذر الاتصال بالخادم. تأكد من الإنترنت.')}
        />
      ) : <View style={styles.loading}><ActivityIndicator color="#fff" size="large" /></View>}
      <View style={styles.bar}>
        <PdfButton path={`/api/projects/${id}/pdf`} name={`${project?.title || 'ملف-إنجاز'}.pdf`} before={flush} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bar: { padding: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
