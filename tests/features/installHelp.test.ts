import { describe, expect, it } from 'vitest';
import { installHelpFor } from '@/features/pwa';

const base = { platform: 'Linux x86_64', maxTouchPoints: 0, standalone: false };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
const MAC = 'Mozilla/5.0 (Macintosh)';

describe('installHelpFor', () => {
  it('says nothing once the app already runs installed', () => {
    expect(installHelpFor({ ...base, userAgent: ANDROID, standalone: true })).toBeNull();
  });

  it('recognises iPhone and iPad', () => {
    expect(installHelpFor({ ...base, userAgent: IPHONE })).toBe('ios');
    const ipad = { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5, standalone: false };
    expect(installHelpFor(ipad)).toBe('ios');
  });

  it('does not take a real Mac for an iPad', () => {
    const mac = { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0, standalone: false };
    expect(installHelpFor(mac)).toBe('desktop');
  });

  it('recognises Android and falls back to desktop', () => {
    expect(installHelpFor({ ...base, userAgent: ANDROID })).toBe('android');
    expect(installHelpFor({ ...base, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(
      'desktop',
    );
  });
});
