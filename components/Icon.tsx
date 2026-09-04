import type { SVGProps } from 'react';

/**
 * Hand-rolled 24px stroke icons. Self-hosted by definition — no icon package,
 * no font, nothing loaded at runtime (§2.3).
 */
const PATHS: Record<string, string> = {
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-3.9 3.6-6 8-6s8 2.1 8 6',
  badge:
    'M6 3h12v18l-6-3-6 3V3ZM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8.5 16c.6-1.4 2-2 3.5-2s2.9.6 3.5 2',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  box: 'M3 8.5 12 4l9 4.5-9 4.5-9-4.5ZM3 8.5V16l9 4.5M21 8.5V16l-9 4.5M12 13v7.5',
  magnifier: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  eye: 'M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
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
};

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
