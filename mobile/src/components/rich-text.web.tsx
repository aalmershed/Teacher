import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { richTextPage } from './rich-text-page';

// نسخة المتصفح (للتطوير وصور المتجر): نفس محرر النص المنسق داخل iframe بدل WebView
export function RichText({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(150);
  const [srcDoc] = useState(() => richTextPage(html || '<p></p>').replace(
    '<body>',
    '<body><script>window.ReactNativeWebView={postMessage:function(m){parent.postMessage({richText:m},"*")}}</script>',
  ));

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.richText) return;
      const m = JSON.parse(e.data.richText);
      if (m.type === 'height') setHeight(Math.max(120, Math.ceil(m.h) + 2));
      else if (m.type === 'html') onChange(m.html);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onChange]);

  return (
    <View style={{ height }}>
      <iframe ref={ref} srcDoc={srcDoc} style={{ border: 0, width: '100%', height: '100%', background: 'transparent' }} />
    </View>
  );
}
