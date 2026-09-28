'use client';

import { useRef, type ReactNode } from 'react';
import { useSchuifrij } from './useSchuifrij';

/**
 * §104 (golf H, T9): a `.schuifrij` for a server component — a `<nav>` or a
 * `<div>` whose chosen item scrolls into view (`useSchuifrij`). The children
 * stay whatever the server rendered.
 */
export function Schuifrij({
  as = 'div',
  className,
  label,
  children,
  testId,
}: {
  as?: 'div' | 'nav';
  className?: string;
  label?: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useSchuifrij(ref);
  const Tag = as;
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`schuifrij${className ? ` ${className}` : ''}`}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </Tag>
  );
}
