// تحسين الظهور في محركات البحث: بيانات وصفية، بيانات منظمة (Schema.org)، الأسئلة الشائعة، robots وخريطة الموقع
const fs = require('fs');
const path = require('path');

const SITE_NAME = 'ملف إنجاز المعلم';
const TITLE = 'ملف إنجاز المعلم — قالب ملف إنجاز إلكتروني جاهز مع باركود QR وتصدير PDF';
const DESCRIPTION = 'أنشئ ملف إنجازك كمعلم أو معلمة في دقائق: قالب ملف إنجاز جاهز بجميع الصفحات، رفع الشواهد مع باركود QR تلقائي، حفظ تلقائي، وتصدير PDF احترافي جاهز للطباعة. التسجيل مجاني.';
const KEYWORDS = 'ملف انجاز المعلم, ملف انجاز معلمة, ملف انجاز جاهز, ملف انجاز الكتروني, قالب ملف انجاز, ملف انجاز معلم, شواهد الأداء الوظيفي, ملف انجاز باركود, ملف انجاز PDF';

// الأسئلة الشائعة: تُعرض في الصفحة الرئيسية وتُضاف كبيانات منظمة لتظهر في نتائج البحث
const FAQ = [
  ['ما هو ملف إنجاز المعلم؟', 'ملف إنجاز المعلم هو ملف منظم يجمع سيرتك الذاتية وخططك وجداولك وشواهد أدائك الوظيفي وأعمال طلابك في مكان واحد. المنصة توفر لك قالبًا إلكترونيًا جاهزًا تعبّئه وتصدّره PDF بتصميم احترافي.'],
  ['هل أقدر أعدّل الصفحات أو أضيف صفحات جديدة؟', 'نعم. كل صفحة قابلة للتعديل بالكامل، وتقدر تضيف صفحات جديدة أو تحذف وتكرر وترتب الصفحات كما تريد.'],
  ['هل التسجيل مجاني؟', 'نعم. التسجيل وإنشاء الملفات وتعديلها ورفع الشواهد ومعاينة الملف كلها مجانية. الاشتراك مطلوب فقط لتنزيل ملف الإنجاز النهائي بصيغة PDF.'],
  ['هل يمكن إلغاء الاشتراك واسترجاع المبلغ؟', 'قيمة الاشتراك غير قابلة للاسترجاع بعد إتمام الدفع، لأن الخدمة رقمية وتُفعَّل فورًا. لذلك تقدر تستخدم المنصة مجانًا قبل الاشتراك: أنشئ ملفك وعدّله وعاين شكله كاملًا، واشترك فقط عندما تكون جاهزًا لتنزيله. والاشتراك لا يتجدد تلقائيًا، فلن يُخصم منك أي مبلغ إلا إذا جدّدت بنفسك.'],
  ['هل يحفظ الموقع عملي تلقائيًا؟', 'نعم، كل تعديل يُحفظ مباشرة. تقدر تقفل الصفحة وترجع لملفك في أي وقت ومن أي جهاز.'],
  ['كيف تعمل رموز QR (الباركود)؟', 'ترفع ملف الشاهد (PDF أو Word أو صورة) أو تضع رابطه، ويتولد له رمز QR داخل ملفك. أي شخص يمسح الرمز بجواله يفتح الشاهد مباشرة، ويمكن وضع أكثر من ملف تحت رمز واحد.'],
  ['هل يناسب شواهد الأداء الوظيفي؟', 'نعم. تقدر ترفع شواهد كل بند من بنود الأداء الوظيفي في صفحته الخاصة، ويتولد لكل بند رمز QR يفتح جميع شواهده، فيكون ملفك مرتبًا وسهل المراجعة.'],
  ['هل القالب مناسب لكل التخصصات؟', 'نعم، المنصة متاحة لجميع التخصصات والمراحل الدراسية. كل الصفحات والعناوين والمحتوى قابلة للتعديل بالكامل، فتقدر تجهّز ملف إنجازك مهما كان تخصصك.'],
  ['هل أقدر أسوي شهادات شكر وتقدير لطلابي؟', 'نعم. من حسابك تقدر تصمم شهادات شكر وتقدير بعدة تصاميم، وتعدّل كل النصوص وتضيف شعار مدرستك والتوقيعات. واكتب أسماء طلابك كل اسم في سطر، وتطلع لك شهادة لكل طالب في ملف PDF واحد جاهز للطباعة.'],
  ['هل أقدر أطبع الملف؟', 'نعم. الملف يُصدَّر PDF بمقاس A4، إما بشكل دفتر مفتوح (صفحتين متقابلتين) أو صفحة مفردة، وجاهز للطباعة.'],
  ['هل يمكن تغيير الاسم بعد التسجيل؟', 'الاسم يظهر تلقائيًا في كل ملفاتك كما سجّلته، لذلك اكتب اسمك الكامل بدقة عند التسجيل. للتصحيح تواصل معنا.'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// يمنع إغلاق وسم <script> من داخل JSON
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function headTags(base, plans) {
  const img = `${base}/og.png`;
  const offers = Object.values(plans).map((p) => ({
    '@type': 'Offer', name: p.name, price: String(p.price), priceCurrency: 'SAR', url: `${base}/register`,
  }));
  return [
    `<link rel="canonical" href="${base}/">`,
    `<meta name="keywords" content="${esc(KEYWORDS)}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:locale" content="ar_SA">`,
    `<meta property="og:url" content="${base}/">`,
    `<meta property="og:title" content="${esc(TITLE)}">`,
    `<meta property="og:description" content="${esc(DESCRIPTION)}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(SITE_NAME)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(TITLE)}">`,
    `<meta name="twitter:description" content="${esc(DESCRIPTION)}">`,
    `<meta name="twitter:image" content="${img}">`,
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    jsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': `${base}/#org`, name: SITE_NAME, url: `${base}/`, logo: `${base}/apple-touch-icon.png` },
        { '@type': 'WebSite', '@id': `${base}/#site`, name: SITE_NAME, url: `${base}/`, inLanguage: 'ar', publisher: { '@id': `${base}/#org` } },
        {
          '@type': 'WebApplication', name: SITE_NAME, url: `${base}/`, inLanguage: 'ar',
          applicationCategory: 'EducationalApplication', operatingSystem: 'Web',
          description: DESCRIPTION, image: img, offers, publisher: { '@id': `${base}/#org` },
        },
        {
          '@type': 'FAQPage',
          mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
        },
      ],
    }),
  ].join('\n');
}

const faqHtml = () => FAQ.map(([q, a]) =>
  `<div class="qa reveal"><button aria-expanded="false">${esc(q)}<span class="pm">+</span></button><div class="ans"><div><p>${esc(a)}</p></div></div></div>`).join('');

let template = null;
function renderHome(publicDir, base, plans) {
  if (!template || process.env.NODE_ENV !== 'production') template = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(DESCRIPTION)}">`)
    .replace('</head>', `${headTags(base, plans)}\n</head>`)
    .replace('<div class="faq" id="faqList"></div>', `<div class="faq" id="faqList">${faqHtml()}</div>`);
}

const robots = (base) => `User-agent: *
Allow: /
Disallow: /api/
Disallow: /app
Disallow: /editor/
Disallow: /certificate/
Disallow: /admin
Disallow: /subscribe
Disallow: /f/
Disallow: /i/
Disallow: /b/
Disallow: /reset

Sitemap: ${base}/sitemap.xml
`;

// تاريخ آخر تعديل حقيقي للصفحة (من ملفاتها) — Google يتجاهل lastmod إذا كان يتغير كل يوم بلا تعديل فعلي
function lastmod(publicDir, files) {
  const t = Math.max(...files.map((f) => { try { return fs.statSync(path.join(publicDir, f)).mtimeMs; } catch { return 0; } }));
  return new Date(t || Date.now()).toISOString().slice(0, 10);
}

// خريطة الموقع: الصفحات العامة المفيدة فقط (صفحة الدخول واستعادة كلمة المرور لا تفيد نتائج البحث)
function sitemap(base, publicDir) {
  const urls = [
    { loc: '/', files: ['index.html', '../server/seo.js'], freq: 'weekly', pr: '1.0', image: { loc: '/og.png', title: SITE_NAME, caption: DESCRIPTION } },
    { loc: '/register', files: ['auth.html'], freq: 'monthly', pr: '0.8' },
  ];
  const body = urls.map((u) => `  <url>
    <loc>${esc(base + u.loc)}</loc>
    <lastmod>${lastmod(publicDir, u.files)}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pr}</priority>${u.image ? `
    <image:image>
      <image:loc>${esc(base + u.image.loc)}</image:loc>
      <image:title>${esc(u.image.title)}</image:title>
      <image:caption>${esc(u.image.caption)}</image:caption>
    </image:image>` : ''}
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;
}

// صفحات خاصة لا يجب أن تظهر في نتائج البحث (لوحات المستخدم وملفات الشواهد الخاصة بالمعلمين)
const NOINDEX = /^\/(api|app|editor|certificate|admin|subscribe|f|i|b|reset)(\/|$)/;
// صفحات عامة لكن بلا فائدة في نتائج البحث: لا تُفهرس، وتُتبع روابطها
const LOW_VALUE = /^\/(login|forgot)\/?$/;

module.exports = { renderHome, robots, sitemap, NOINDEX, LOW_VALUE, FAQ };
