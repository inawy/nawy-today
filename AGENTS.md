# AGENTS.md — Nawy Today

المرجع الوحيد للعاملين على المشروع (بشر أو وكلاء).

## ما هو
تقويم شخصي، محلي أولًا، PWA، عربي أولًا. لا Backend. انظر `docs/PRODUCT_SPEC.md`.

## قبل أي عمل
1. اقرأ `docs/DECISIONS.md` و`docs/BUILD_PLAN.md`.
2. اعمل على **مرحلة واحدة** فقط. لا تقفز للأمام.
3. لا تضف مكتبة أو تغيّر معمارية دون قرار جديد في `DECISIONS.md`.

## قواعد صارمة
- **الصدق:** لا ميزة في الواجهة لا يمكن الوفاء بها (لا تذكيرات/إشعارات — D-002).
- **الطبقات:** `core ← data ← features ← ui ← app`. `core` لا يستورد React ولا Dexie ولا DOM.
- **الواجهة لا تستدعي Dexie مباشرة.**
- **الوقت:** كل حساب تواريخ عبر `core/time` فقط. لا `new Date()` متناثرة.
- **لا حذف فعلي** للبيانات؛ tombstones (D-008).
- **لا `dangerouslySetInnerHTML`**، ولا موارد خارجية، ولا CDN.
- **CSS:** وحدات منطقية (`margin-inline-start`…) لا `left/right`. لمس ≥ 44px. مدخلات 16px.
- **TypeScript:** `strict` + `noUncheckedIndexedAccess`. لا `any` بلا تعليق مبرِّر.
- اختصارات الكيبورد بـ `event.code`.
- كل تغيير سلوك = اختبار. كل خطأ يُصلَح = اختبار يفشل قبل الإصلاح.

## الأوامر
`npm ci` · `npm run dev` · `npm run build` · `npm run preview` · `npm test` · `npm run lint` · `npm run format:check`
(`npx playwright test` يُضاف في Phase 10.)

## بوابات CI
install (`npm ci`) ← lint (0 تحذيرات) ← format ← test ← build (يتضمن `tsc`) ← e2e (لاحقًا).
لا دمج في `main` قبل أن يخضر CI على الفرع.

## عند الشك
اسأل صاحب المشروع. وبلّغ مبكرًا إن ظهر أن تقنية ما كانت الأنسب وليست معتمدة — لا تنتظر النهاية.
