// إرسال البريد (استعادة كلمة المرور) عبر SMTP — يعمل مع Gmail أو Zoho أو أي مزود بريد
const nodemailer = require('nodemailer');

const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
};
const enabled = () => !!(SMTP.host && SMTP.user && SMTP.pass);

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transport;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sendResetEmail(to, name, link) {
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f7f4ef;padding:28px 12px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e4ded4;color:#233230;line-height:1.8">
    <h2 style="margin:0 0 12px;color:#2f5e58">ملف إنجاز المعلم</h2>
    <p>مرحبًا ${esc(name)}،</p>
    <p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط الزر التالي لاختيار كلمة مرور جديدة:</p>
    <p style="text-align:center;margin:26px 0"><a href="${esc(link)}" style="background:#5f978f;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;display:inline-block">تعيين كلمة مرور جديدة</a></p>
    <p style="font-size:13px;color:#5d6a67">الرابط صالح لمدة ساعة واحدة ولمرة واحدة فقط. إذا لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي.</p>
  </div></div>`;
  const text = `مرحبًا ${name}،\nلإعادة تعيين كلمة المرور افتح الرابط التالي (صالح لمدة ساعة):\n${link}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.`;
  return getTransport().sendMail({ from: `"ملف إنجاز المعلم" <${SMTP.from}>`, to, subject: 'إعادة تعيين كلمة المرور — ملف إنجاز المعلم', html, text });
}

module.exports = { enabled, sendResetEmail };
