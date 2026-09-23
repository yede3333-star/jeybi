# تقدّم العمل — جيبي / Jeybi (المرحلة الأولى)

آخر تحديث: 2026-09-23 — نهاية الجلسة الثانية. **المرحلة الأولى مكتملة**، والباقي تجربة على هاتف حقيقي والنشر (انظر آخر الملف).

## ✅ حالة أقسام jeybi-phase1.md

| القسم | الحالة | أين |
|---|---|---|
| §1 PWA، offline، Repository منفصل | ✅ مُختبَر: التطبيق يعمل بعد إيقاف السيرفر | `vite.config.ts`، `src/repo/*` |
| §2 لغتان، RTL/LTR، أرقام لاتينية، MRU، ×100 | ✅ مُختبَر (اختبارات + متصفح) | `src/lib/money.ts`، `src/i18n/*` |
| §3 المحافظ + التحويل + الرسوم | ✅ | `src/repo/wallets.ts`، `src/repo/transactions.ts`، `src/pages/Manage.tsx` |
| §4 التصنيفات الرئيسية والفرعية، أرشفة بدل حذف | ✅ | `src/repo/categories.ts`، `src/pages/Manage.tsx` |
| §5 إدخال سريع، تفاصيل، وسوم، تقسيم، قوالب | ✅ مُختبَر في المتصفح | `src/components/TxEditor.tsx`، `src/repo/templates.ts` |
| §6 تراجع، حذف ناعم، محذوفات، سجل | ✅ | `src/components/Toast.tsx`، `src/pages/Trash.tsx`، `src/pages/TxDetail.tsx` |
| §7 بحث وفلاتر مع المجموع | ✅ | `src/pages/Transactions.tsx`، `filterTransactions` |
| §8 التقارير، "أين ذهب مالي؟"، Excel/PDF/صورة | ✅ مُختبَر: PDF صفحتان بعربية سليمة، PNG، Excel | `src/pages/Reports.tsx`، `src/components/ReportPrint.tsx`، `src/services/{pdf,excel,share}.ts` |
| §9 الشاشة الرئيسية | ✅ | `src/pages/Home.tsx` |
| §10 PIN، البصمة، نسخ احتياطي، تذكير، persist | ✅ PIN مُختبَر؛ البصمة **تحتاج تجربة على Chrome Android** | `src/components/Lock.tsx`، `src/pages/Security.tsx`، `src/pages/Backup.tsx`، `src/services/security.ts` |
| §11 الإعدادات، الوضع الليلي، حجم الخط، الترحيب | ✅ مُختبَر (عربي فاتح + فرنسي داكن) | `src/pages/Settings.tsx`، `src/pages/Onboarding.tsx` |
| §12 اختبارات + بيانات تجريبية | ✅ 55 اختبارًا ناجحًا | `src/tests/*`، `src/repo/demo.ts` |
| §13 النشر + README | ✅ جاهز، **لم يُرفع بعد** (يحتاج مستودع GitHub من المستخدم) | `.github/workflows/deploy.yml`، `netlify.toml`، `README.md` |

## 🐞 أخطاء وجدتها التجربة الفعلية وأُصلحت

- `useEffect(() => window.scrollTo(...))`: في Chrome الحديث تُرجع `scrollTo` وعدًا (Promise) فيتعطّل React ← صار داخل أقواس.
- القفل كان يُطلب فورًا بعد إنشاء الرمز في الترحيب ← `markUnlocked()`.
- عدد البيانات التجريبية لم يحتسب عمليات الرسوم المرتبطة، والبيانات كانت تُنتج أرصدة سالبة ← أُعيد ضبطها + اختبار يضمن عدم السلبية.
- صياغة "أين ذهب مالي؟" ("لـإيجار") وتكرار "أخرى" ← "إيجار 16%" و"باقي التصنيفات".
- التصدير كان ينتظر `requestAnimationFrame` ← `setTimeout`.

## 📌 قرارات تقنية يجب الالتزام بها

1. **Node.js v24** في `C:\Program Files\nodejs` — في Git Bash: `export PATH="/c/Program Files/nodejs:$PATH"`. ملف `.claude/launch.json` يستعمل `C:/PROGRA~1/nodejs/node.exe` لأن تطبيق Claude لا يرى Node في PATH.
2. **Tailwind v4** بدون `tailwind.config`؛ الداكن بالفئة `.dark`؛ ألوان دلالية (`bg-surface`، `bg-page`، `text-ink`، `text-muted`، `ring-line`، `.text-income/.text-expense/.text-transfer`) وفئات جاهزة (`.card .btn-primary .btn-soft .btn-ghost .btn-danger .input .label .chip .chip-on .section-title .num`). خصائص منطقية فقط (`ms-/me-/ps-/pe-/start-/end-`)، و`rtl:rotate-180` للأسهم.
3. **react-router v8 + `HashRouter`**؛ `base` = `process.env.BASE_PATH || './'`.
4. **المبالغ أعداد صحيحة ×100**؛ التنسيق عبر `useFmt()` فقط (يضيف LRI/PDI في العربية؛ `stripBidi` للنصوص الخام).
5. **كل دخل/مصروف له `splits[]`**، و`categoryIds` مشتق للفهرسة؛ التحويل `splits=[]` + `toWalletId`.
6. **رسوم التحويل** = مصروف منفصل في `sysKey='fees'` مرتبط بـ `transferId`/`feeTxId`.
7. **الواجهة لا تستورد `db`** — فقط `src/repo/*` و`src/hooks/data.ts`.
8. العناصر الافتراضية بـ `sysKey` واسمها من `sys.<sysKey>`؛ إعادة التسمية تمسح `sysKey`.
9. دوال التعديل في repo تُرجع `undo()` تُمرَّر إلى `useToast()`.
10. الإعدادات في جدول `meta`؛ `DEVICE_ONLY_KEYS` (PIN، البصمة) لا تدخل في النسخة الاحتياطية.
11. **PDF/صورة:** DOM للطباعة (`ReportPrint`، ألوان فاتحة ثابتة) ← `html-to-image` ← `jsPDF`. لا نص مباشر في PDF.
12. SheetJS من `cdn.sheetjs.com`.
13. **أداة Bash/Edit هنا تحوّل `\uXXXX` إلى أحرف فعلية** — استعمل `String.fromCharCode(...)`.
14. **الترجمة:** أضف كل مفتاح إلى `ar.ts` ثم `fr.ts` (نوعه `Dict`، فالناقص يُفشل `tsc`). مفاتيح ديناميكية: `errors.<code>`، `backup.errors.<code>`، `history.<action>`، `history.fields.<field>`، `tx.saved_<type>`، `sys.<sysKey>`.
15. **المرحلة الثانية:** أضف `this.version(2).stores({...}).upgrade(...)` في `src/data/db.ts` ولا تعدّل `version(1)`.
16. الفرع الرئيسي اسمه `main` (سير عمل النشر يعمل عليه).

## ▶️ الخطوة التالية

1. **المستخدم:** إنشاء مستودع GitHub ورفع المشروع وتفعيل Pages (الخطوات في README).
2. تجربة على هاتف Android حقيقي: التثبيت، البصمة (WebAuthn)، المشاركة إلى واتساب، الكاميرا لصورة الوصل.
3. بعدها: المرحلة الثانية.
