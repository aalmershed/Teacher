// السنة الهجرية الحالية (أم القرى). محرك Hermes في الآيفون ما يدعم كل خيارات Intl،
// فإذا تعذّر الحساب نرجع نصًا فارغًا بدل ما يتعطل التطبيق.
export function hijriYear(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric' }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value || '';
    return /^\d{4}$/.test(y) ? y : '';
  } catch {
    return '';
  }
}
