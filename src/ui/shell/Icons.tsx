// Our own small icon set (D-012: no icons copied from another product). Decorative: the
// buttons that use them carry an accessible name.

const common = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function MenuIcon() {
  return (
    <svg {...common}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** Points toward the inline end; mirrored by CSS in RTL (see `.icon-flip`). */
export function ChevronIcon() {
  return (
    <svg {...common}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...common}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...common}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...common}>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />
    </svg>
  );
}
