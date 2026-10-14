# المعمارية — Nawy Today

```text
src/
  core/        دوال نقية. لا React، لا Dexie، لا DOM.
    time/        غلاف التاريخ والمناطق والتنسيق
    recurrence/  توسعة RRULE + الاستثناءات
    layout/      توزيع التراكب، شرائط الشهر، خط الآن
    model/       أنواع Calendar/CalEvent، التحقق (البوابة الوحيدة)، tombstones، دمج، envelope
    search/      تطبيع عربي + مطابقة
  data/        Dexie: schema · store (CRUD) · backup (تصدير/استيراد) · snapshots · purge · storage
  features/    منطق كل ميزة (hooks + حالة): events, calendars, view, settings, backup
  ui/          مكوّنات العرض: shell, views (today/day/week/month), editor, dialogs
  app/         التركيب: الجذر، المسارات، حدّ الأخطاء، تسجيل SW
  lib/         أدوات صغيرة عامة (focus trap, keyboard, a11y)
tests/         وحدات (Vitest)
e2e/           متصفح حقيقي على النسخة المبنية (Playwright)
tools/         أدوات تطوير فقط (مثل مولّد fixtures بـ Python) — لا تُشحن
docs/          PRODUCT_SPEC · BUILD_PLAN · DECISIONS · ARCHITECTURE
```

## اتجاه الاعتماد (يُفرض بـ lint)
`core` ← `data` ← `features` ← `ui` ← `app`
(`lib` قابل للاستيراد من `features` وما فوقها فقط.)

## تدفق البيانات
`ui` ⟶ `features` (hooks) ⟶ `data` (Dexie `liveQuery`) ⟶ IndexedDB.
القراءة حية: أي تغيير (حتى من تبويب آخر) يعيد الرسم تلقائيًا.
الواجهة **لا تستدعي Dexie مباشرة** أبدًا.

## مسار الرسم لعرض ما
1. `features` يطلب أحداث المدى المرئي من `data`.
2. `core/recurrence` يوسّع السلاسل ضمن المدى.
3. `core/layout` يحسب المواضع (دوال نقية، قابلة للاختبار بلا DOM).
4. `ui` يرسم نتيجة جاهزة فقط.

## مبادئ الصيانة
- كل مكتبة خارجية خلف غلاف وبقرار مسجل.
- الأخطاء تُحتوى: كل حدث يُرسم داخل حدّ أخطاء، وفشل فتح القاعدة له شاشة استرداد.
- تغيير المخطط = إصدار Dexie جديد + اختبار ترحيل.
- لا `dangerouslySetInnerHTML` (قاعدة lint).
