import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/theme';

// محرر نص منسق (عريض، قوائم، محاذاة...) — نفس أوامر محرر الموقع، داخل WebView صغير
// لأن React Native ما فيه حقل نص منسق أصلي. الخادم ينظّف الـHTML عند الحفظ (cleanRich).
const page = (html: string) => `<!doctype html><html dir="rtl"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;background:transparent;font-family:-apple-system,system-ui,sans-serif;color:${colors.ink};font-size:16px;line-height:1.7}
  .bar{display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:${colors.bg};border:1px solid ${colors.line};border-bottom:0;border-radius:10px 10px 0 0}
  .bar button{min-width:36px;height:34px;border:1px solid ${colors.line};background:#fff;border-radius:8px;font-size:15px;color:${colors.ink};padding:0 6px}
  .bar button:active{background:${colors.brandLight}}
  .sep{width:1px;background:${colors.line};margin:4px 2px}
  #ed{min-height:90px;padding:10px 12px;border:1px solid ${colors.line};border-radius:0 0 10px 10px;background:#fff;outline:none}
  #ed:focus{border-color:${colors.brand}}
  #ed h3{font-size:1.1em;margin:.3em 0}
  #ed p{margin:.3em 0}
  #ed ul,#ed ol{margin:.3em 0;padding-inline-start:1.4em}
</style></head><body>
<div class="bar">
  <button data-cmd="bold"><b>B</b></button>
  <button data-cmd="italic"><i>I</i></button>
  <button data-cmd="underline"><u>U</u></button>
  <span class="sep"></span>
  <button data-cmd="formatBlock" data-val="H3">عنوان</button>
  <button data-cmd="formatBlock" data-val="P">فقرة</button>
  <button data-cmd="insertUnorderedList">•</button>
  <button data-cmd="insertOrderedList">1.</button>
  <span class="sep"></span>
  <button data-cmd="justifyRight">⇥</button>
  <button data-cmd="justifyCenter">≡</button>
  <button data-cmd="justifyFull">☰</button>
  <span class="sep"></span>
  <button data-cmd="removeFormat">⌫</button>
</div>
<div id="ed" contenteditable="true">${html}</div>
<script>
  const ed = document.getElementById('ed');
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const height = () => post({ type: 'height', h: document.body.scrollHeight });
  const changed = () => { post({ type: 'html', html: ed.innerHTML }); height(); };
  ed.addEventListener('input', changed);
  ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  document.querySelectorAll('.bar button').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    b.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (document.activeElement !== ed) ed.focus();
      document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
      changed();
    });
  });
  new ResizeObserver(height).observe(document.body);
  height();
</script></body></html>`;

export function RichText({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const [height, setHeight] = useState(150);
  // المحتوى الأولي فقط: إعادة تحميل الصفحة مع كل حرف تضيّع مكان المؤشر
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: page(html || '<p></p>') }), []);

  return (
    <View style={{ height }}>
      <WebView
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
