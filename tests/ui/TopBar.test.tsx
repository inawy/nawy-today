import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsProvider, defaultSettings } from '@/features/settings';
import { TopBar } from '@/ui/shell/TopBar';

afterEach(cleanup);

const bar = (title: string) =>
  render(
    <SettingsProvider
      storage={{ getItem: () => JSON.stringify(defaultSettings('ar')), setItem: () => undefined }}
      languages={['ar']}
    >
      <TopBar
        title={title}
        view="days3"
        onView={() => undefined}
        onMenu={() => undefined}
        menuRef={{ current: null }}
        drawerOpen={false}
        onToday={() => undefined}
        onPrevious={() => undefined}
        onNext={() => undefined}
        onSearch={() => undefined}
      />
    </SettingsProvider>,
  );

describe('the title in the top bar', () => {
  it('keeps the part after a comma on one line', () => {
    bar('الأحد، 25 أكتوبر 2026');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.querySelector('.title-rest')?.textContent).toBe('25 أكتوبر 2026');
  });

  it('lets a range title with no comma wrap, so a phone does not cut the year off', () => {
    bar('26–28 أكتوبر 2026');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('26–28 أكتوبر 2026');
    expect(heading.querySelector('.title-rest')).toBeNull();
  });
});
