import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { API_URL, authHeaders } from './api';

// ينزّل ملف PDF من الخادم (نفس ملف الموقع) ويفتح قائمة المشاركة في الجوال:
// حفظ في Files، واتساب، AirDrop، طباعة...
export async function downloadPdf(path: string, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(API_URL + path, { headers: authHeaders() });
  } catch {
    Alert.alert('تعذر التنزيل', 'تعذر الاتصال بالخادم. تأكد من الإنترنت.');
    return;
  }
  if (!res.ok) {
    let msg = 'تعذر إنشاء ملف PDF';
    let code = '';
    try { const d = await res.json(); msg = d.error || msg; code = d.code; } catch { /* ليس JSON */ }
    if (code === 'SUBSCRIPTION_REQUIRED') return askToSubscribe();
    Alert.alert('تعذر التنزيل', msg);
    return;
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const name = (m ? decodeURIComponent(m[1]) : fallbackName).replace(/[\\/:*?"<>|]/g, '-');
  try {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(new Uint8Array(await res.arrayBuffer()));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
  } catch (e: any) {
    Alert.alert('تعذر حفظ الملف', e.message);
  }
}

export function askToSubscribe() {
  Alert.alert(
    'التنزيل للمشتركين',
    'تقدر تسوي ملفاتك وتعدّلها وتعاينها مجانًا. تنزيل ملف PDF يحتاج اشتراك.',
    [
      { text: 'لاحقًا', style: 'cancel' },
      { text: 'اشترك الآن', onPress: () => router.push('/subscribe') },
    ],
  );
}
