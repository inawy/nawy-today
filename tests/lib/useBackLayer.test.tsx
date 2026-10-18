import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackLayer } from '@/lib/useBackLayer';

function Probe({ active, onBack }: { active: boolean; onBack: () => Promise<boolean> }) {
  useBackLayer(active, onBack);
  return null;
}

const back = async () => {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 20));
  });
};

afterEach(cleanup);

describe('useBackLayer', () => {
  it('pushes one entry while active and removes it when closed from inside', async () => {
    const start = window.history.length;
    const view = render(<Probe active={false} onBack={async () => true} />);
    expect(window.history.length).toBe(start);
    view.rerender(<Probe active onBack={async () => true} />);
    expect(window.history.length).toBe(start + 1);
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    view.rerender(<Probe active={false} onBack={async () => true} />);
    await waitFor(() => expect(onPop).toHaveBeenCalled()); // our own history.back()
    window.removeEventListener('popstate', onPop);
  });

  it('Back calls onBack; when it closes, no second entry is pushed', async () => {
    const onBack = vi.fn(async () => true);
    const view = render(<Probe active onBack={onBack} />);
    const length = window.history.length;
    await back();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBeLessThanOrEqual(length);
    view.rerender(<Probe active={false} onBack={onBack} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(onBack).toHaveBeenCalledTimes(1); // the close did not count as another Back
  });

  it('when onBack says "stay", the entry is pushed again so Back keeps working', async () => {
    const onBack = vi.fn(async () => false);
    render(<Probe active onBack={onBack} />);
    await back();
    expect(onBack).toHaveBeenCalledTimes(1);
    await back();
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
