import type { Locale } from '@/features/settings';

const ar = {
  appName: 'ناوي توداي',
  tagline: 'يومك بطريقتك.',
  today: 'اليوم',
  previousMonth: 'الشهر السابق',
  nextMonth: 'الشهر التالي',
  menu: 'القائمة',
  settings: 'الإعدادات',
  viewMonth: 'شهر',
  views: 'العرض',
  calendars: 'التقويمات',
  noCalendars: 'لا توجد تقويمات بعد.',
  moreEvents: '+{count} أخرى',
  allDay: 'طوال اليوم',
  untitled: '(بلا عنوان)',
  loading: 'جارٍ التحميل…',
  loadError: 'تعذّر فتح بياناتك على هذا الجهاز.',
  loadErrorHelp: 'بياناتك لم تُمس. أعد المحاولة، وإن استمر الخطأ فاستعد من نسخة احتياطية.',
  retry: 'إعادة المحاولة',
  eventFailed: 'تعذّر عرض هذا الحدث',
  somethingWrong: 'حدث خطأ غير متوقع في هذه الشاشة.',
  reload: 'إعادة تحميل',
  skipToContent: 'تخطّي إلى المحتوى',
  closeMenu: 'إغلاق القائمة',
  language: 'اللغة',
  theme: 'المظهر',
  themeAuto: 'تلقائي',
  themeLight: 'فاتح',
  themeDark: 'داكن',
  notSaved: 'تعذّر حفظ الإعدادات على هذا المتصفح؛ ستعمل لهذه الجلسة فقط.',
} as const;

export type MessageKey = keyof typeof ar;

const en: Record<MessageKey, string> = {
  appName: 'Nawy Today',
  tagline: 'Your day, your way.',
  today: 'Today',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  menu: 'Menu',
  settings: 'Settings',
  viewMonth: 'Month',
  views: 'View',
  calendars: 'Calendars',
  noCalendars: 'No calendars yet.',
  moreEvents: '+{count} more',
  allDay: 'All day',
  untitled: '(untitled)',
  loading: 'Loading…',
  loadError: "Couldn't open your data on this device.",
  loadErrorHelp: 'Your data was not touched. Try again, and if it persists restore from a backup.',
  retry: 'Try again',
  eventFailed: "Couldn't show this event",
  somethingWrong: 'Something unexpected went wrong on this screen.',
  reload: 'Reload',
  skipToContent: 'Skip to content',
  closeMenu: 'Close menu',
  language: 'Language',
  theme: 'Theme',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  notSaved: "Settings couldn't be saved in this browser; they apply to this session only.",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ar, en };

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const text = MESSAGES[locale][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
