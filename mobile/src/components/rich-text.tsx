import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { richTextPage } from './rich-text-page';

// محرر نص منسق (عريض، قوائم، محاذاة...) — نفس أوامر محرر الموقع، داخل WebView صغير
// لأن React Native ما فيه حقل نص منسق أصلي. الخادم ينظّف الـHTML عند الحفظ (cleanRich).


export function RichText({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const [height, setHeight] = useState(150);
  // المحتوى الأولي فقط: إعادة تحميل الصفحة مع كل حرف تضيّع مكان المؤشر
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: richTextPage(html || '<p></p>') }), []);

  return (
    <View style={{ height }}>
      <WebView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        source={source}
        scrollEnabled={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        style={{ backgroundColor: 'transparent' }}
        onMessage={(e) => {
          const m = JSON.parse(e.nativeEvent.data);
          if (m.type === 'height') setHeight(Math.max(120, Math.ceil(m.h) + 2));
          else if (m.type === 'html') onChange(m.html);
        }}
      />
    </View>
  );
}
