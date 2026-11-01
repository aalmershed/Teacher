# تطبيق مركز المعلم (iOS / Android)

تطبيق أصلي مبني بـ Expo (React Native)، يستخدم نفس خادم الموقع `https://mualimhub.com`.

## التشغيل للتجربة

```bash
cd mobile
npm install
npx expo start
```

للتجربة على خادم محلي بدل الموقع المنشور:

```bash
EXPO_PUBLIC_API_URL=http://عنوان-جهازك:3000 npx expo start
```

## الدخول

التطبيق يرسل الترويسة `X-Client: mobile` مع كل طلب، فيرجع الخادم رمز الجلسة في رد الدخول والتسجيل.
يُحفظ الرمز في SecureStore ويُرسل بعدها في `Authorization: Bearer <الرمز>` بدل الكوكيز.

## هيكل المجلد

```
src/app/            الشاشات (Expo Router)
  login, register, forgot   الدخول والتسجيل ونسيت كلمة المرور
  (tabs)/            ملفاتي، الشهادات، الكشوف، حسابي
src/components/     عناصر الواجهة المشتركة
src/lib/api.ts      الاتصال بالخادم وحفظ رمز الجلسة
src/lib/auth.tsx    حالة تسجيل الدخول
src/theme.ts        ألوان وخطوط الموقع
```
