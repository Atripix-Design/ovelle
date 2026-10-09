import type { HTMLAttributes } from 'react';
import { Button } from './index.js';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

export type PaginationProps = MaterialProps & Omit<HTMLAttributes<HTMLElement>, 'onChange'> & {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  size?: 'compact' | 'regular';
  label?: string;
};
export function paginationItems(page: number, pageCount: number): (number | 'gap')[] {
  const count = Math.max(1, Math.floor(Number.isFinite(pageCount) ? pageCount : 1));
  const current = Math.max(1, Math.min(count, Math.floor(Number.isFinite(page) ? page : 1)));
  const pages = Array.from(new Set([1, count, current - 1, current, current + 1].filter(n => n > 0 && n <= count))).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  pages.forEach((n, i) => {
    if (i && n - pages[i - 1] === 2) items.push(n - 1);
    else if (i && n - pages[i - 1] > 2) items.push('gap');
    items.push(n);
  });
  return items;
}
export function Pagination({ material, glassFrost, reduceTransparency, className, style, page, pageCount, onPageChange, disabled, size = 'regular', label = 'Pagination', ...rest }: PaginationProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'pagination');
  const count = Math.max(1, Math.floor(Number.isFinite(pageCount) ? pageCount : 1));
  const current = Math.max(1, Math.min(count, Math.floor(Number.isFinite(page) ? page : 1)));
  const appearance = { material, glassFrost, reduceTransparency };
  return <nav {...rest} {...visual} aria-label={label} data-size={size}>
    <Button {...appearance} size="compact" variant="quiet" disabled={disabled || current === 1} onClick={() => onPageChange(current - 1)} aria-label="Previous page">‹</Button>
    <div className="ov-pagination-pages">{paginationItems(current, count).map((item, i) => item === 'gap' ? <span key={`gap-${i}`} aria-hidden="true">…</span> : <Button {...appearance} size="compact" key={item} variant={item === current ? 'primary' : 'quiet'} disabled={disabled} aria-label={`Page ${item}`} aria-current={item === current ? 'page' : undefined} onClick={() => onPageChange(item)}>{item}</Button>)}</div>
    <span className="ov-pagination-summary">{current} / {count}</span>
    <Button {...appearance} size="compact" variant="quiet" disabled={disabled || current === count} onClick={() => onPageChange(current + 1)} aria-label="Next page">›</Button>
  </nav>;
}
