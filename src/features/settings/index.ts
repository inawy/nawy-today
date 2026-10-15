export {
  SETTINGS_KEY,
  applyToDocument,
  defaultSettings,
  detectLocale,
  loadSettings,
  parseSettings,
  saveSettings,
} from './settings';
export type {
  Locale,
  ReadableStorage,
  Settings,
  ThemePreference,
  WritableStorage,
} from './settings';
export { SettingsProvider, useSettings } from './SettingsContext';
