import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ChevronIcon,
  CloseIcon,
  EditIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  ViewsIcon,
} from '@/ui/shell/Icons';

// The components must carry the vendored Material Symbols path unchanged (D-080).
const ICONS = [
  ['menu', MenuIcon],
  ['chevron_right', ChevronIcon],
  ['close', CloseIcon],
  ['add', PlusIcon],
  ['calendar_view_month', ViewsIcon],
  ['search', SearchIcon],
  ['edit', EditIcon],
] as const;

describe('icons (Material Symbols Outlined, vendored)', () => {
  for (const [name, Icon] of ICONS) {
    it(`${name}: same path as the vendored SVG, drawn in the text colour, hidden from readers`, () => {
      const source = readFileSync(`src/assets/icons/${name}.svg`, 'utf8');
      const expected = /<path d="([^"]+)"/.exec(source)?.[1];
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 -960 960 960');
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('path')?.getAttribute('d')).toBe(expected);
    });
  }
});
