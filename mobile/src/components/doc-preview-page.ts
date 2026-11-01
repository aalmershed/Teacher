// صفحة معاينة الشهادة أو الكشف (تُستخدم في WebView على الجوال وفي iframe بالمتصفح)
export type Renderer = 'CertRender' | 'SheetRender';

const SCRIPT = { CertRender: '/assets/js/cert-render.js', SheetRender: '/assets/js/sheet-render.js' };

export const previewPage = (renderer: Renderer) => `<!doctype html><html dir="rtl"><head>
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
    // نص العلامة المائية في التطبيق «نسخة معاينة» فقط، بدون دعوة للاشتراك (قوانين Apple)
    pv.srcdoc = ${renderer}.render(data, Object.assign({ fontCss: '@import url(/assets/fonts.css);', imageUrl: (u) => '/i/' + u, screen: true }, opts)).replace(/نسخة معاينة · اشترك لتنزيل [^<]*/g, 'نسخة معاينة');
    fit();
  };
  window.ReactNativeWebView.postMessage('ready');
</script></body></html>`;
