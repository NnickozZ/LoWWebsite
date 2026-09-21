import type { SVGProps } from 'react';

/**
 * Hand-rolled 24px stroke icons. Self-hosted by definition — no icon package,
 * no font, nothing loaded at runtime (§2.3).
 */
const PATHS: Record<string, string> = {
  // §43: a web — three knots and the lines between them.
  web: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 5l-7 11M12 5l7 11M7 18h10',
  minus: 'M5 12h14',
  /*
   * §84: vijf vormen die er niet waren, en daarom vier betekenissen deelden.
   *
   * `box` was de kist, de winkel, het tabblad "wat je al hebt" én de lege cover
   * van huisraad; `book` was de plank én de catalogus; `plus` was neerzetten,
   * geven, uitdelen en de uitdeelknop. Een icoon dat twee dingen betekent
   * betekent er geen — `components/kamer/plekWords.ts` houdt nu de tabel bij en
   * een test leest hem.
   */
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z',
  shop: 'M3 9.5h18L19.5 21h-15zM3 9.5 5 3.5h14l2 6M9.5 21v-6h5v6',
  gift: 'M3.5 11.5h17V21h-17zM2.5 7.5h19v4h-19zM12 7.5V21M12 7.5C10.5 3.5 6 3.9 6 6.1c0 1.2 1.8 1.7 6 1.4M12 7.5c1.5-4 6-3.6 6-1.4 0 1.2-1.8 1.7-6 1.4',
  shelf: 'M3 14.5h18M5.5 14.5V18M18.5 14.5V18M7.5 14.5V9.5h3v5M13 14.5v-7h3.2v7',
  desk: 'M2.5 10.5h19v2h-19zM4.5 12.5V21M19.5 12.5V21M8 16h7.5M8 16v3.5h7.5V16',
  layers: 'M3 8l9 4 9-4-9-4zM3 12l9 4 9-4M3 16l9 4 9-4',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-3.9 3.6-6 8-6s8 2.1 8 6',
  badge:
    'M6 3h12v18l-6-3-6 3V3ZM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8.5 16c.6-1.4 2-2 3.5-2s2.9.6 3.5 2',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  box: 'M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5V16l9 4.5M21 8.5V16l-9 4.5M12 13v7.5',
  magnifier: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  eye: 'M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  // The same eye with a line through it: 'verbergen' is the twin of 'tonen'
  // and a button that turns a thing off should not wear the icon that turns it on.
  eyeOff:
    'M2 12s3.8-6 10-6c1.7 0 3.2.4 4.5 1.1M22 12s-3.8 6-10 6c-1.7 0-3.2-.4-4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18',
  flag: 'M5 21V4M5 4h11l-2 3.5L16 11H5',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  book: 'M5 4h9a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5zM19 4v13',
  notebook: 'M7 3h12v18H7zM7 8H4M7 13H4M7 18H4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  home: 'M4 11 12 4l8 7M6.5 9.5V20h11V9.5',
  folder: 'M3 6h6l2 2.5h10V20H3zM3 6v14',
  board: 'M3 4h18v13H3zM12 17v3M8 20h8M8 8h3v3H8zM15 9h3v3h-3z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-3.9 3.6-6 8-6s8 2.1 8 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  camera: 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  link: 'M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5',
  check: 'M5 12.5 10 17.5 19 7',
  chevron: 'M9 6l6 6-6 6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  // §32: a ruled axis with marks above and below it — a tijdlijn.
  timeline: 'M2 12h20M7 12V6M7 6h4M12 12v6M12 18h4M17 12V8M17 8h3M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  // §66: een stamboom — one above, a bar, two below.
  tree: 'M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 7.5V12M6 12h12M6 12v4.5M18 12v4.5M6 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3l1.5 2.5h2.8l.7 2.7 2.4 1.4-.7 2.7 .7 2.7-2.4 1.4-.7 2.7h-2.8L12 21l-1.5-2.5H7.7L7 15.8l-2.4-1.4.7-2.7-.7-2.7L7 7.6l.7-2.7h2.8z',
  mask: 'M4 5c2.5-1.3 5.3-2 8-2s5.5.7 8 2v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10zM8.5 11h2M13.5 11h2M9 15.5c1 .8 2 1.2 3 1.2s2-.4 3-1.2',
  swap: 'M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4',
  sort: 'M4 6h16M7 12h10M10 18h4',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  crosshair: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 3v4M12 17v4M3 12h4M17 12h4',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  note: 'M5 4h11l3 3v13H5zM8 10h8M8 14h6',
  mapPin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  // §33: the tekenlaag — a pencil, a gum, and an arrow that takes the last line back.
  pencil: 'M14.5 4.5l5 5L8 21H3v-5zM12 7l5 5',
  eraser: 'M14 4l6 6-8.5 8.5a2 2 0 0 1-2.8 0L4.5 14.3a2 2 0 0 1 0-2.8zM9 19.5 5 15.5M20 20h-9',
  undo: 'M9 14 4 9l5-5M4 9h10a5.5 5.5 0 0 1 0 11h-3',
  // §90 canvas: "Opnieuw schikken" — three kaartjes laid out in rows, not the
  // four corners of "Alles in beeld", which it sat beside looking identical.
  arrange: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 12h12M6 12v5M18 12v5',
  // §90 canvas: fold every window out, and back in — not Lezen's eye.
  unfold: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  fold: 'M12 3v6M12 15v6M8 5l4 4 4-4M8 19l4-4 4 4M5 12h14',
};

/** §43: the same strokes, for drawing on a canvas with `Path2D`. */
export const ICON_PATHS: Readonly<Record<string, string>> = PATHS;

export type IconName = keyof typeof PATHS | string;

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name] ?? PATHS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
