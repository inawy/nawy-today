import { useCallback } from 'react';
import { useSettings } from '@/features/settings';
import { translate } from './messages';
import type { MessageKey } from './messages';

export { MESSAGES, translate } from './messages';
export type { MessageKey } from './messages';

/** `t('today')` in the current language. */
export function useT(): (key: MessageKey, params?: Record<string, string | number>) => string {
  const { settings } = useSettings();
  const locale = settings.locale;
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}
