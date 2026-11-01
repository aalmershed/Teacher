import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@/theme';
import type { Props } from './doc-preview';
import { previewPage } from './doc-preview-page';

// نسخة المتصفح (للتطوير وصور المتجر): نفس صفحة المعاينة داخل iframe بدل WebView
const shim = '<script>window.ReactNativeWebView={postMessage:function(){}}</script>';

export function DocPreview({ renderer, data, options }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [srcDoc] = useState(() => previewPage(renderer).replace('<body>', '<body>' + shim));

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      (ref.current?.contentWindow as any)?.show?.(data, options || {});
    }, 150);
    return () => clearTimeout(t);
  }, [ready, data, options]);

  return (
    <View
      style={{ width: '100%', height: width ? (width * 794) / 1123 : 200, borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <iframe ref={ref} srcDoc={srcDoc} onLoad={() => setReady(true)} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
