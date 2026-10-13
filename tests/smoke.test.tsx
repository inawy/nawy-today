import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';

afterEach(cleanup);

describe('smoke', () => {
  it('renders the app title and tagline', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ناوي توداي' })).toBeTruthy();
    expect(screen.getByText('يومك بطريقتك.')).toBeTruthy();
  });
});
