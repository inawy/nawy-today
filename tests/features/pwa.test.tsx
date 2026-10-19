import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt, useServiceWorker } from '@/features/pwa';
import type { PwaState, WorkerContainer, WorkerRegistration } from '@/features/pwa';

afterEach(cleanup);

function fakeWorld(options: { controlled: boolean; waiting?: boolean; active?: boolean }) {
  const posted: unknown[] = [];
  const registrationListeners: Record<string, () => void> = {};
  const installingListeners: (() => void)[] = [];
  const containerListeners = new Set<() => void>();
  const installing = { state: 'installing', addEventListener: (_t: 'statechange', l: () => void) => installingListeners.push(l) };
  const registration: WorkerRegistration = {
    waiting: options.waiting ? { postMessage: (m) => posted.push(m) } : null,
    installing: null,
    active: options.active ? {} : null,
    addEventListener: (t, l) => (registrationListeners[t] = l),
    update: vi.fn(async () => undefined),
  };
  const container: WorkerContainer = {
    controller: options.controlled ? {} : null,
    register: vi.fn(async () => registration),
    addEventListener: (_t, l) => containerListeners.add(l),
    removeEventListener: (_t, l) => containerListeners.delete(l),
  };
  return {
    container,
    registration,
    posted,
    containerListeners,
    startInstalling: () => {
      (registration as { installing: unknown }).installing = installing;
      registrationListeners.updatefound?.();
    },
    finishInstalling: () => {
      installing.state = 'installed';
      installingListeners.forEach((l) => l());
    },
  };
}

function probe(container: WorkerContainer | undefined) {
  const box: { state: PwaState | undefined } = { state: undefined };
  function Probe() {
    box.state = useServiceWorker(container);
    return null;
  }
  render(<Probe />);
  return box;
}
const settle = () => act(async () => { await Promise.resolve(); });

describe('useServiceWorker', () => {
  it('does nothing without a container (development)', () => {
    const box = probe(undefined);
    expect(box.state).toMatchObject({ updateReady: false, offlineReady: false });
  });

  it('registers the worker relative to the app, scoped to its own folder', async () => {
    const w = fakeWorld({ controlled: false });
    probe(w.container);
    await settle();
    expect(w.container.register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('first install finishing means "ready offline", not "update"', async () => {
    const w = fakeWorld({ controlled: false });
    const box = probe(w.container);
    await settle();
    act(() => w.startInstalling());
    act(() => w.finishInstalling());
    expect(box.state).toMatchObject({ offlineReady: true, updateReady: false });
    act(() => box.state?.dismissOfflineReady());
    expect(box.state?.offlineReady).toBe(false);
  });

  it('a new version installed under a running one is an update that waits for the user', async () => {
    const w = fakeWorld({ controlled: true });
    const box = probe(w.container);
    await settle();
    act(() => w.startInstalling());
    act(() => w.finishInstalling());
    expect(box.state).toMatchObject({ updateReady: true, offlineReady: false });
    expect(w.posted).toEqual([]); // nothing was told to take over
  });

  it('an update already waiting when the page opens is offered', async () => {
    const w = fakeWorld({ controlled: true, waiting: true, active: true });
    const box = probe(w.container);
    await settle();
    expect(box.state?.updateReady).toBe(true);
  });

  it('pressing update asks the waiting worker to take over; only then may the page reload', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const w = fakeWorld({ controlled: true, waiting: true, active: true });
    const box = probe(w.container);
    await settle();
    // A controller change the user did not ask for (another tab updated) must not reload us.
    act(() => w.containerListeners.forEach((l) => l()));
    expect(reload).not.toHaveBeenCalled();
    act(() => box.state?.applyUpdate());
    expect(w.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    act(() => w.containerListeners.forEach((l) => l()));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('a registration failure leaves the app working without error', async () => {
    const w = fakeWorld({ controlled: false });
    (w.container.register as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('blocked'));
    const box = probe(w.container);
    await settle();
    expect(box.state).toMatchObject({ updateReady: false, offlineReady: false });
  });

  it('removes its listeners when it goes away', async () => {
    const w = fakeWorld({ controlled: false });
    const { unmount } = render(<Wrapper container={w.container} />);
    await settle();
    expect(w.containerListeners.size).toBe(1);
    unmount();
    expect(w.containerListeners.size).toBe(0);
  });
});

function Wrapper({ container }: { container: WorkerContainer }) {
  useServiceWorker(container);
  return null;
}

describe('useInstallPrompt', () => {
  function installProbe() {
    const box: { state: ReturnType<typeof useInstallPrompt> | undefined } = { state: undefined };
    function Probe() {
      box.state = useInstallPrompt();
      return null;
    }
    render(<Probe />);
    return box;
  }

  it('offers nothing until the browser says installing is possible', () => {
    const box = installProbe();
    expect(box.state?.canInstall).toBe(false);
  });

  it('keeps the browser prompt for our own button, shows it once, and hides after install', async () => {
    const box = installProbe();
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(box.state?.canInstall).toBe(true);
    await act(async () => box.state?.install());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(box.state?.canInstall).toBe(false);
    act(() => box.state?.install()); // nothing left to prompt
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('hides the button when the app gets installed another way', () => {
    const box = installProbe();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    act(() => void window.dispatchEvent(event));
    expect(box.state?.canInstall).toBe(true);
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(box.state?.canInstall).toBe(false);
  });
});
