# خطة النشر — من مجلد محلي إلى بلِجن يركّبه أي واحد

> هذا الملف **لصاحب المشروع** (خطوات يدوية بحساباته). المشروع نفسه جاهز للنشر.

## 0) التحقق قبل أي شي (بدون حساب)

```powershell
cd D:\DeepSeek Harness\Projects\buttons
node test\delete-session.test.mjs
node test\client-bundle.test.mjs
npm pack --dry-run     # يعرض الملفات اللي رح تنشر، ولا ينشر شي
```

المطلوب: اختبارين ناجحين + لائحة ملفات نظيفة (بلا `node_modules`، بلا أسرار).

## 1) GitHub — المصدر والمستودع

1. أنشئ حساب على <https://github.com/signup> إذا ما عندك (اسم المستخدم اللي تختاره
   بيصير رابط المستودع).
2. أنشئ مستودع جديد: **New repository** ← الاسم `dsh-buttons` ← **Public** ← بلا
   README ولا .gitignore (عندنا ملفاتنا).
3. ارفع الملفات: من صفحة المستودع ← **Add file → Upload files** ← اسحب **محتويات**
   المجلد (مش المجلد نفسه):
   `package.json` · `index.js` · `lib\` · `test\` · `cordis.patch.yml` ·
   `repair-registry.mjs` · `README.md` · `LICENSE` · `CHANGELOG.md` · `.gitignore`
   ← ثم **Commit changes**.
4. ارجع لي باسم المستخدم، وأنا أضيف حقول `repository` و`bugs` و`homepage` في
   `package.json` وأضبط رابط التركيب في README.

## 2) npm — التركيب بأمر واحد

```powershell
# مرة وحدة بالعمر
npm login            # اسم المستخدم + كلمة السر + كود 2FA إذا مفعّل

# من مجلد المشروع
cd D:\DeepSeek Harness\Projects\buttons
npm publish --dry-run   # فحص أخير
npm publish             # النشر الفعلي
```

- الاسم `dsh-buttons` **متاح** (متأكد منه).
- `"private": true` مش موجود بالمشروع (npm يرفض النشر معه).
- إذا طلب كود 2FA: من تطبيق المصادقة أو الإيميل.
- تحديث نسخة لاحقاً: عدّل `version` في `package.json` و`sections` في `CHANGELOG.md`
  ثم `npm publish` مرة تانية (npm ما يقبل نفس الرقم مرتين).

## 3) التحقق بعد النشر

```powershell
# لازم يرجع رقم النسخة
npm view dsh-buttons version

# تركيب نظيف عند أي مستخدم (يفكّ link المحلي ويستعمل npm)
dsh plugin --profile desktop remove dsh-session-delete
dsh plugin --profile desktop add dsh-buttons
```

ثم **إعادة تشغيل DSH**. أهم اختبار حقيقي: يفتح المستخدم القائمة «…» على صف محادثة
ويشوف الخيارات.

## 4) الظهور في سوق البلِجنات

`dshmarket` (Settings ← Plugin Market) يفهرس بلِجنات npm حسب الكلمات المفتاحية —
المشروع فيه `dsh` و`dsh-plugin` و`deepseek-harness`، فبيظهر بالبحث بعد النشر.

## 5) النسخ القادمة (أفكار)

- زر تاني: تصدير المحادثة المحددة (ملف واحد).
- زر تالت: تحديد كل محادثات مساحة عمل.
- Cleanup تلقائي للـ ghosts: تشغيل `repair-registry` عند الإقلاع بمهلة قصيرة.

## تحذيرات صريحة

- DSH لسا `rc`: أي تغيير بأسماء الـ slots أو الـ primitives ممكن يكسر الأزرار.
- لا تنشر أسرار ولا مفاتيح؛ الملفات المنشورة هي المذكورة بـ `files` في `package.json`.
- إذا انكسر الإقلاع عند مستخدم: الإصلاح من واجهة التطبيق
  **"Disable third-party plugins, back up profile patch, and restart"**.
