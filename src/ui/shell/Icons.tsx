// Icons: Google Material Symbols, Outlined, 24px (D-080, Apache-2.0: see src/assets/icons/). The
// path data is the upstream's, unchanged; only colour (currentColor) and a11y attributes are ours.
// Decorative: the buttons that use them carry an accessible name.

const common = {
  width: 24,
  height: 24,
  viewBox: '0 -960 960 960',
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: false,
} as const;

export function MenuIcon() {
  return (
    <svg {...common}>
      <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
    </svg>
  );
}

/** Points toward the inline end; mirrored by CSS in RTL (see `.icon-flip`). */
export function ChevronIcon() {
  return (
    <svg {...common}>
      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...common}>
      <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...common}>
      <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
    </svg>
  );
}

/** A month grid: "choose how the calendar is laid out". */
export function ViewsIcon() {
  return (
    <svg {...common}>
      <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-360h160v-200H160v200Zm240 0h160v-200H400v200Zm240 0h160v-200H640v200ZM320-240v-200H160v200h160Zm80 0h160v-200H400v200Zm240 0h160v-200H640v200Z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...common}>
      <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...common}>
      <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z" />
    </svg>
  );
}
