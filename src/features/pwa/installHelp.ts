// Where the browser cannot offer an install button by itself (iOS Safari never fires
// `beforeinstallprompt`; Chrome only fires it once it deems the site installable) we tell the
// person the steps instead of showing a button we cannot honour (D-027, D-030). Nothing is shown
// once the app already runs installed.

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallEnvironment {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
  /** True when the page is already running as an installed app. */
  readonly standalone: boolean;
}

export function installHelpFor(env: InstallEnvironment): InstallPlatform | null {
  if (env.standalone) return null;
  const ua = env.userAgent;
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function readInstallEnvironment(): InstallEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone,
  };
}
