import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/lib/ErrorBoundary';

afterEach(cleanup);

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>fine</p>;
}

describe('ErrorBoundary', () => {
  it('shows the fallback instead of blanking, reports the error, and can recover', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    shouldThrow = true;
    render(
      <ErrorBoundary
        onError={(e) => seen.push(e.message)}
        fallback={(e, reset) => (
          <button type="button" onClick={reset}>
            failed: {e.message}
          </button>
        )}
      >
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'failed: boom' })).toBeTruthy();
    expect(seen).toEqual(['boom']);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('fine')).toBeTruthy();
    spy.mockRestore();
  });

  it('contains a failure to its own subtree', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shouldThrow = true;
    render(
      <div>
        <p>sibling</p>
        <ErrorBoundary fallback={() => <p>contained</p>}>
          <Bomb />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('sibling')).toBeTruthy();
    expect(screen.getByText('contained')).toBeTruthy();
    spy.mockRestore();
  });
});
