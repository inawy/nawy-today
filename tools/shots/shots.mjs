// Takes screenshots of the BUILT app (served by `vite preview` on :4174) with realistic data, so a
// design review can look at the real screens. Not a test: it only writes PNGs to ./shots.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4174/';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function seed(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: /Add event|إضافة حدث/ }).waitFor();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('nawy-today');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const now = Date.now();
    const cals = [
      ['cal-personal', 'شخصي', 'blue'],
      ['cal-work', 'عمل', 'green'],
      ['cal-family', 'العائلة', 'red'],
    ];
    const pad = (n) => String(n).padStart(2, '0');
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const ev = (id, cal, title, offset, from, to, extra = {}) => ({
      id, calendarId: cal, title, allDay: false, start: `${day(offset)}T${from}`,
      end: `${day(offset)}T${to}`, tzid: 'Asia/Riyadh', createdAt: now, updatedAt: now, ...extra,
    });
    const allDay = (id, cal, title, offset, span = 1) => ({
      id, calendarId: cal, title, allDay: true, start: day(offset), end: day(offset + span),
      createdAt: now, updatedAt: now,
    });
    const events = [
      ev('e1', 'cal-work', 'اجتماع الفريق', 0, '09:00', '10:00'),
      ev('e2', 'cal-personal', 'غداء مع أحمد', 0, '13:00', '14:30', { location: 'مطعم النخيل' }),
      ev('e3', 'cal-family', 'أخذ الأولاد من المدرسة', 0, '15:30', '16:00'),
      ev('e4', 'cal-personal', 'نادي رياضي', 0, '18:30', '19:30'),
      ev('e5', 'cal-work', 'مراجعة المشروع', 1, '10:00', '11:30'),
      ev('e6', 'cal-work', 'مكالمة العميل', 1, '10:30', '11:00'),
      ev('e7', 'cal-personal', 'موعد الطبيب', 2, '16:00', '17:00', { notes: 'إحضار التحاليل' }),
      ev('e8', 'cal-family', 'عشاء العائلة', 3, '20:00', '22:00'),
      ev('e9', 'cal-work', 'عرض تقديمي', 4, '11:00', '12:00'),
      ev('e10', 'cal-personal', 'قراءة', -1, '21:00', '22:00'),
      ev('e11', 'cal-work', 'ورشة عمل', -2, '09:30', '12:00'),
      ev('e12', 'cal-family', 'زيارة الجدة', 6, '17:00', '19:00'),
      ev('e13', 'cal-work', 'تسليم التقرير', 8, '14:00', '15:00'),
      ev('e14', 'cal-personal', 'سفر', 10, '07:00', '09:00'),
      allDay('e15', 'cal-family', 'إجازة المدرسة', 2, 3),
      allDay('e16', 'cal-personal', 'عيد ميلاد سارة', 5),
      allDay('e17', 'cal-work', 'مؤتمر', 12, 2),
    ];
    const tx = db.transaction(['calendars', 'events'], 'readwrite');
    for (const [id, name, color] of cals) {
      tx.objectStore('calendars').put({ id, name, color, visible: true, createdAt: now, updatedAt: now });
    }
    for (const e of events) tx.objectStore('events').put(e);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.bar, .agenda-item, .tg-block').first().waitFor();
}

async function session(name, contextOptions, steps) {
  const context = await browser.newContext({ timezoneId: 'Asia/Riyadh', reducedMotion: 'reduce', ...contextOptions });
  const page = await context.newPage();
  await seed(page);
  const shot = async (label) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png` });
  };
  try {
    await steps(page, shot);
  } catch (error) {
    console.error(`session ${name} stopped early:`, String(error).slice(0, 400));
  }
  await context.close();
}

const key = (page, code) => page.keyboard.press(code);

await session('desktop-ar', { viewport: { width: 1280, height: 800 }, locale: 'ar-SA' }, async (page, shot) => {
  await shot('month');
  await key(page, 'KeyW'); await shot('week');
  await key(page, 'KeyD'); await shot('day');
  await key(page, 'KeyA'); await shot('agenda');
  await key(page, 'KeyC'); await shot('editor');
  await key(page, 'Escape');
  await page.getByRole('button', { name: 'البيانات والنسخ الاحتياطي' }).click();
  await shot('data');
});

await session('desktop-en-dark', { viewport: { width: 1280, height: 800 }, locale: 'en-US', colorScheme: 'dark' }, async (page, shot) => {
  await shot('month');
  await key(page, 'KeyW'); await shot('week');
});

await session('phone-ar', { viewport: { width: 390, height: 844 }, locale: 'ar-SA', hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, async (page, shot) => {
  await shot('agenda');
  await page.getByRole('button', { name: 'القائمة' }).click(); await shot('drawer');
  await page.getByRole('button', { name: 'إغلاق القائمة' }).click();
  await page.getByRole('button', { name: 'شهر' }).click(); await shot('month');
  await page.getByRole('button', { name: 'إضافة حدث' }).click(); await shot('editor');
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: '3 أيام' }).click(); await shot('days3');
  await page.getByRole('button', { name: 'أسبوع' }).click(); await shot('week');
  await page.getByRole('button', { name: 'يوم' }).click(); await shot('day');
});

await browser.close();
