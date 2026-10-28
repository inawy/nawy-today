import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb } from '@/data';

afterEach(cleanup);

const open = () =>
  render(
    <App
      create={() => createDb(`sw-${Math.random().toString(36).slice(2)}`)}
      now={() => Date.UTC(2026, 9, 13, 12, 0)}
      storage={{ getItem: () => null, setItem: () => undefined }}
    />,
  );

const swipe = (el: Element, dx: number, dy: number) => {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 200 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }] });
};

describe('closing by swiping (D-063)', () => {
  it('the drawer closes when swiped toward its edge, not the other way', async () => {
    const { container } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    const shell = container.querySelector('.shell') as HTMLElement;
    const aside = container.querySelector('#sidebar') as HTMLElement;
    expect(shell.getAttribute('data-drawer')).toBe('open');
    swipe(aside, 120, 5); // English reads left to right: the drawer comes from the left
    expect(shell.getAttribute('data-drawer')).toBe('open');
    swipe(aside, -30, 0);
    expect(shell.getAttribute('data-drawer')).toBe('open');
    swipe(aside, -120, 5);
    expect(shell.getAttribute('data-drawer')).toBe('closed');
  });

  it('a read-only sheet closes when its header is swiped down, but not from its text', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'About and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'About Nawy Today' });
    swipe(dialog.querySelector('.about-text') as Element, 0, 120);
    expect(screen.queryByRole('dialog', { name: 'About Nawy Today' })).toBeTruthy();
    swipe(dialog.querySelector('.sheet-grip') as Element, 0, 40);
    expect(screen.queryByRole('dialog', { name: 'About Nawy Today' })).toBeTruthy();
    swipe(dialog.querySelector('.sheet-grip') as Element, 0, 120);
    expect(screen.queryByRole('dialog', { name: 'About Nawy Today' })).toBeNull();
  });

  it('the editor is not closed by a swipe (it would save a draft by accident)', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    swipe(dialog.querySelector('.ed-head') as Element, 0, 160);
    expect(screen.queryByRole('dialog', { name: 'New event' })).toBeTruthy();
  });
});
