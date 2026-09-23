# تقدّم العمل — جيبي / Jeybi (المرحلة الأولى)

آخر تحديث: 2026-09-23 — توقف مؤقت بطلب المستخدم.

> لم يُشغَّل أي بناء أو اختبار بعد. الكود المكتوب لم يمرّ على `tsc` حتى الآن.

---

## ✅ مُنجز بالكامل (منطق/بيانات — بدون واجهة)

| القسم في jeybi-phase1.md | الملفات |
|---|---|
| §1 إعداد المشروع (config) | `package.json`، `tsconfig.json`، `vite.config.ts` (PWA + manifest + workbox)، `vitest.config.ts`، `index.html` (تطبيق اللغة/الثيم/الخط قبل أول رسم)، `.gitignore` |
| §1 أيقونات PWA | `public/favicon.svg`، `scripts/make-icons.mjs` (يولّد PNG بدون مكتبات — **لم يُشغَّل بعد**: `npm run icons`) |
| §2 الأرقام والعملة | `src/lib/money.ts` (أرقام لاتينية دائمًا، `ar-u-nu-latn`، أشهر موريتانية `ar-MR`، المبالغ ×100، عزل bidi للإشارة السالبة، لوحة الأرقام) |
| §8 حدود الفترات | `src/lib/period.ts` (يوم/أسبوع/شهر/سنة/مخصص، بداية أسبوع قابلة للضبط، التنقل، أعمدة الرسم الزمني) |
| نموذج البيانات | `src/data/types.ts`، `src/data/db.ts` (Dexie v1)، `src/data/defaults.ts` (المحافظ والتصنيفات الافتراضية مع تصنيفات فرعية) |
| §3–§7 طبقة Repository | `src/repo/transactions.ts` (إنشاء/تعديل/حذف ناعم/استرجاع/حذف نهائي، التحويل + رسوم كمصروف مرتبط، التقسيم، الوسوم، دوال `undo`)، `src/repo/audit.ts` (سجل التغييرات)، `src/repo/wallets.ts`، `src/repo/categories.ts` (أرشفة بدل حذف المستخدَم)، `src/repo/templates.ts` (قوالب + إنشاء من عملية + تطبيق بلمسة)، `src/repo/receipts.ts`، `src/repo/settings.ts`، `src/repo/init.ts` (البذر الأولي، `storage.persist()`، مسح الكل) |
| §8 حسابات التقارير | `src/services/reports.ts` (أرصدة، مجاميع تستثني التحويلات، توزيع حسب التصنيف مع الفرعيات والتقسيم، حسب المحفظة، رسم زمني، أكبر 10، مقارنة بالفترة السابقة، الفلترة والبحث ومجموع النتائج) |
| §10 الأمان (منطق) | `src/services/security.ts` (PIN عبر PBKDF2، بصمة WebAuthn محلية مع التحقق من التوقيع) |
| §10 النسخ الاحتياطي (منطق) | `src/repo/backup.ts` (تصدير JSON مع الصور، تحليل ومعاينة، استعادة تحافظ على PIN/البصمة) |
| §12 بيانات تجريبية | `src/repo/demo.ts` (6 أشهر، باللغتين، وسوم وعمليات مقسمة، قابلة للمسح) |
| §8 التصدير (منطق) | `src/services/excel.ts` (ورقة ملخص + ورقة عمليات، RTL)، `src/services/pdf.ts` (تحويل DOM لصورة ثم PDF متعدد الصفحات مع قطع ذكي)، `src/services/share.ts` (Web Share مع بديل التحميل)، `src/services/image.ts` (ضغط صورة الوصل) |
| React أساسيات | `src/i18n/index.ts`، `src/hooks/settings.tsx`، `src/hooks/fmt.ts`، `src/hooks/data.ts`، `src/index.css` (Tailwind v4، ألوان فاتح/داكن، أحجام خط)، `src/components/Icon.tsx`، `src/components/ui.tsx` (Sheet, PageHeader, Segmented, Toggle…)، `src/components/Toast.tsx` (إشعار مع زر تراجع) |

## 🟡 مُنجز جزئيًا

- **§1 التبعيات:** تم تثبيت تبعيات التشغيل. أمر تثبيت تبعيات التطوير (`vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/vite`, `vite-plugin-pwa`, `vitest`, `fake-indexeddb`, `@types/node`) كان ما يزال يعمل لحظة التوقف — **تحقّق** من وجود `devDependencies` في `package.json`، وإلا أعد تشغيل الأمر (انظر الخطوة التالية).
- **§2 الترجمة:** `src/i18n/index.ts` يستورد `./ar` و`./fr` — **الملفان `src/i18n/ar.ts` و`src/i18n/fr.ts` غير موجودين بعد.**
- **§12 الاختبارات:** مجلد `src/tests/` فارغ؛ `vitest.config.ts` يشير إلى `src/tests/setup.ts` **غير الموجود** (يجب أن يحتوي `import 'fake-indexeddb/auto';`).

## ⬜ لم يبدأ بعد

- `src/main.tsx` و`src/App.tsx` (المزوّدات + `HashRouter` + المسارات).
- مكونات: `BottomNav`، زر `+` العائم، `TxEditor` (لوحة أرقام → تصنيف → حفظ، تفاصيل: محفظة، تاريخ، ملاحظة، وسوم مع اقتراحات، صورة وصل، تقسيم)، `CategoryGrid`، `TagInput`، `TxRow`، `WalletCard`، `PeriodNav`، `LockScreen` + مزوّد القفل (مهلة الخمول، البصمة)، عرض تقرير مخصّص للطباعة (للـ PDF/الصورة).
- الصفحات: الترحيب (لغة ← أرصدة افتتاحية ← PIN)، الرئيسية (§9)، العمليات مع البحث والفلاتر (§7)، تفاصيل العملية + السجل، التقارير (§8)، "أين ذهب مالي؟"، الإعدادات (§11) وفروعها: المحافظ، التصنيفات، القوالب، المحذوفات، الأمان، النسخ الاحتياطي/الاستيراد، بانر التذكير الأسبوعي.
- ملفات الترجمة `ar.ts` و`fr.ts`.
- الاختبارات (§12): الأرصدة، التحويلات خارج الدخل/المصروف، التقسيم، مجاميع الفترات، حدود الأسابيع/الأشهر، التراجع.
- §13: `.github/workflows/deploy.yml` (المجلد موجود وفارغ)، `README.md` بالعربية.
- التجربة الفعلية في المتصفح (مقاس هاتف، اللغتان، الوضعان، بدون إنترنت، PDF عربي، البصمة).

## 📌 قرارات تقنية يجب الالتزام بها

1. **Node.js v24** مثبّت عبر winget في `C:\Program Files\nodejs` — في Git Bash قد يلزم `export PATH="/c/Program Files/nodejs:$PATH"`.
2. **Tailwind v4** عبر `@tailwindcss/vite` (لا يوجد `tailwind.config`)؛ الوضع الداكن بالفئة `.dark` على `<html>`؛ ألوان دلالية: `bg-surface`، `bg-page`، `text-ink`، `text-muted`، `ring-line`، `.text-income/.text-expense/.text-transfer`؛ فئات جاهزة: `.card .btn-primary .btn-soft .btn-ghost .btn-danger .input .label .chip .chip-on .section-title .num`. استعمل الخصائص المنطقية (`ms-/me-/ps-/pe-/start-/end-`) و`rtl:rotate-180` للأسهم.
3. **react-router v8** بـ **`HashRouter`**، و`base` في Vite = `process.env.BASE_PATH || './'` (سير عمل GitHub Pages يضبط `BASE_PATH=/<اسم-المستودع>/`).
4. **المبالغ أعداد صحيحة ×100** في كل مكان؛ التنسيق فقط عبر `useFmt()` / `formatMoney` (يضيف عزل LRI/PDI في العربية — استعمل `stripBidi` في الاختبارات).
5. **كل عملية دخل/مصروف لها `splits[]`** (جزء واحد للعادية) و`categoryIds` مشتق للفهرسة؛ التحويل `splits=[]` و`toWalletId`.
6. **رسوم التحويل** = عملية مصروف منفصلة في تصنيف `sysKey='fees'` مرتبطة بـ `transferId`/`feeTxId`؛ الـ repo يزامنها عند التعديل والحذف.
7. **الواجهة لا تستورد `db` مباشرة** — فقط عبر `src/repo/*` و`src/hooks/data.ts` (للانتقال لاحقًا إلى Capacitor).
8. **العناصر الافتراضية** تحمل `sysKey` واسمها يأتي من الترجمة `sys.<sysKey>`؛ عند إعادة التسمية يُمسح `sysKey`. مفاتيح `sys.*` المطلوبة: `cash bankily masrvi sedad bank food groceries restaurants transport taxi fuel phone rent utilities family health clothes education charity fees other_expense salary commissions services gifts other_income`.
9. **دوال التعديل في repo تُرجع `undo()`** تُمرَّر مباشرة إلى `useToast()({ message, undo })`.
10. الإعدادات في جدول `meta` (مفتاح/قيمة)؛ الإعدادات الخاصة بالجهاز (`DEVICE_ONLY_KEYS`) لا تدخل في النسخة الاحتياطية.
11. **PDF:** رسم تقرير DOM مخصّص للطباعة ← `html-to-image` ← `jsPDF` (لا كتابة نص عربي مباشرة في PDF). الخطوط = خطوط النظام (`skipFonts: true`).
12. SheetJS مثبّت من المصدر الرسمي `cdn.sheetjs.com` (نسخة npm قديمة).
13. **أداة Bash في هذه البيئة تحوّل `\uXXXX` إلى أحرف فعلية** — لا تكتب هذه التسلسلات في الكود؛ استعمل `String.fromCharCode(...)`.
14. مفاتيح الترجمة المستعملة حتى الآن: `common.today`، `common.yesterday`، `common.unknown`، `common.close`، `common.back`، `common.undo`، و`sys.*` أعلاه.

## ▶️ الخطوة التالية بالتحديد

1. التحقق من تبعيات التطوير:
   ```bash
   npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vite-plugin-pwa vitest fake-indexeddb @types/node
   ```
2. تشغيل `npm run icons`.
3. كتابة `src/components/TxEditor.tsx` (مع لوحة الأرقام وشبكة التصنيفات)، ثم `src/main.tsx` و`src/App.tsx`، ثم الصفحات بالترتيب: الترحيب ← الرئيسية ← العمليات ← التقارير ← الإعدادات.
4. استخراج كل مفاتيح `t('...')` وكتابة `src/i18n/ar.ts` و`src/i18n/fr.ts`.
5. `src/tests/setup.ts` والاختبارات، ثم `npx tsc --noEmit` و`npm test`، ثم التجربة في المتصفح، ثم workflow النشر وREADME.
