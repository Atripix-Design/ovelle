import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

export type SkeletonProps = MaterialProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children?: ReactNode; shape?: 'text' | 'rectangle' | 'circle';
  width?: CSSProperties['width']; height?: CSSProperties['height']; animated?: boolean;
  /** Keeps the same mounted content and geometry when loading ends. */
  loading?: boolean;
};
type Block = { x: number; y: number; width: number; height: number; radius: number };
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const atomic = 'img,svg,canvas,video,iframe,button,input,select,textarea,[role="button"],[data-skeleton="block"]';

/** Measures real DOM layout; no component names or per-page mask registry. */
export function Skeleton({ material, glassFrost, reduceTransparency, className, style, children, shape = 'text', width, height, animated = true, loading = true, ...rest }: SkeletonProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style: { width, height, ...style } }, 'skeleton');
  const content = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  useClientLayoutEffect(() => {
    const root = content.current;
    if (!root || !loading) return;
    let disposed = false, frame = 0;
    const resize = new ResizeObserver(schedule);
    function displayed(node: Element) {
      for (let current: Element | null = node; current && current !== root; current = current.parentElement) {
        const s = getComputedStyle(current);
        if (s.display === 'none' || s.opacity === '0' || current.hasAttribute('hidden') || current.getAttribute('data-skeleton') === 'ignore') return false;
      }
      return true;
    }
    function measure() {
      if (disposed || !root) return;
      const bounds = root.getBoundingClientRect(), next: Block[] = [];
      const covered = new Set<Element>();
      const add = (rect: DOMRect, radius: number) => {
        if (rect.width > .5 && rect.height > .5) next.push({ x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height, radius: Math.min(radius, rect.width / 2, rect.height / 2) });
      };
      const insideCovered = (n: Element) => { for (let p: Element | null = n; p && p !== root; p = p.parentElement) if (covered.has(p)) return true; return false; };
      for (const node of Array.from(root.querySelectorAll(atomic))) {
        if (insideCovered(node) || !displayed(node)) continue;
        const rect = node.getBoundingClientRect(), s = getComputedStyle(node);
        if (!rect.width || !rect.height) continue;
        covered.add(node);
        add(rect, Number.parseFloat(s.borderRadius) || 4);
      }
      // Painted empty shapes include unchecked indicators and CSS-only placeholders.
      for (const node of Array.from(root.querySelectorAll('*'))) {
        resize.observe(node);
        if (insideCovered(node) || !displayed(node) || Array.from(node.children).some(child => displayed(child)) || node.textContent?.trim()) continue;
        const s = getComputedStyle(node);
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || Number.parseFloat(s.borderWidth) > 0 || s.backgroundImage !== 'none') {
          covered.add(node); add(node.getBoundingClientRect(), Number.parseFloat(s.borderRadius) || 4);
        }
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement;
        if (!node.textContent?.trim() || !parent || insideCovered(parent) || !displayed(parent) || ['SCRIPT','STYLE','OPTION'].includes(parent.tagName)) continue;
        const s = getComputedStyle(parent);
        // CSS-clipped screen-reader text is accessibility metadata, not visible content.
        if (s.clipPath !== 'none' || (s.clip !== 'auto' && s.position === 'absolute')) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        const lineHeight = Number.parseFloat(s.lineHeight), parentBounds = parent.getBoundingClientRect();
        const plainSlot = !parent.querySelector(atomic) && Array.from(parent.children).every(child => getComputedStyle(child).display.startsWith('inline'));
        if (plainSlot && s.display !== 'inline' && parent.childNodes.length === 1) {
          add(parentBounds, 4); covered.add(parent); continue;
        }
        for (const rect of Array.from(range.getClientRects())) {
          const height = Number.isFinite(lineHeight) ? lineHeight : rect.height;
          const y = Math.abs(parentBounds.height - height) < 1 ? parentBounds.y : rect.y - (height - rect.height) / 2;
          add(new DOMRect(rect.x, y, rect.width, height), 4);
        }
      }
      setBlocks(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; measure(); }); }
    resize.observe(root); measure();
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    root.addEventListener('load', schedule, true); root.addEventListener('input', schedule, true);
    document.fonts.addEventListener('loadingdone', schedule); void document.fonts.ready.then(schedule);
    window.addEventListener('resize', schedule);
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); root.removeEventListener('load', schedule, true); root.removeEventListener('input', schedule, true); document.fonts.removeEventListener('loadingdone', schedule); window.removeEventListener('resize', schedule); };
  }, [children, loading]);
  return <div {...rest} {...visual} aria-hidden={loading || undefined} inert={loading || undefined} data-loading={loading} data-shape={shape} data-animated={animated} data-content={children !== undefined || undefined}>
    {children !== undefined && <><div className="ov-skeleton-content" ref={content}>{children}</div>{loading && <svg className="ov-skeleton-map" width="100%" height="100%" aria-hidden="true">{blocks.map((block, index) => <rect key={index} x={block.x} y={block.y} width={block.width} height={block.height} rx={block.radius}/>)}</svg>}</>}
  </div>;
}
export type SkeletonRegionProps = HTMLAttributes<HTMLDivElement> & { label?: string; loading?: boolean; children: ReactNode };
export function SkeletonRegion({ label = 'Loading content…', loading = true, children, ...rest }: SkeletonRegionProps) {
  return <div {...rest} aria-busy={loading}>{loading && <span role="status" className="ov-sr-only">{label}</span>}{children}</div>;
}
export type LoadingBoundaryProps = SkeletonProps & { label?: string; regionClassName?: string };
/** Put around the data-dependent region of any page, retaining the real mounted layout. */
export function LoadingBoundary({ loading = true, label, regionClassName, ...props }: LoadingBoundaryProps) {
  return <SkeletonRegion loading={loading} label={label} className={regionClassName}><Skeleton {...props} loading={loading}/></SkeletonRegion>;
}
