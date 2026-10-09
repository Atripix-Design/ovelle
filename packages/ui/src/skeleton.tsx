import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

export type SkeletonProps = MaterialProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Render the real composition to reserve its exact responsive layout. */
  children?: ReactNode;
  shape?: 'text' | 'rectangle' | 'circle';
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  animated?: boolean;
};
type Block = { x: number; y: number; width: number; height: number; radius: number };
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Decorative only. The caller labels its loading region once, not every block. */
export function Skeleton({ material, glassFrost, reduceTransparency, className, style, children, shape = 'text', width, height, animated = true, ...rest }: SkeletonProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style: { width, height, ...style } }, 'skeleton');
  const content = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  useClientLayoutEffect(() => {
    const root = content.current;
    if (!root) return;
    let disposed = false;
    function measure() {
      if (disposed || !root) return;
      const bounds = root.getBoundingClientRect();
      const next: Block[] = [];
      const add = (rect: DOMRect, radius: number) => {
        if (rect.width && rect.height) next.push({ x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height, radius });
      };
      // Match the native counterpart's visible text/icon masks, retaining the actual control geometry underneath.
      const atomic = 'svg,img,input,select,textarea,.ov-check';
      // These public source slots are stretched Figma TEXT nodes: their entire allocated box
      // is one mask, including wrapped lines. Other labels keep their natural text width.
      const textSlots = '.ov-card-body,.ov-card-link > span,.ov-feature-card > h3,.ov-download-card > h3,.ov-dialog-body,.ov-confirmation-dialog > h2,.ov-dialog-status,.ov-download-requirements,.ov-status-content > strong,.ov-status-body,.ov-faq-question,.ov-faq-answer,.ov-empty-content > h3,.ov-empty-description,.ov-select > span:first-child,.ov-download-label';
      const displayed = (node: HTMLElement) => {
        let current: HTMLElement | null = node;
        while (current && current !== root) {
          const computed = getComputedStyle(current);
          if (computed.display === 'none' || computed.opacity === '0' || current.hidden) return false;
          current = current.parentElement;
        }
        return true;
      };
      root.querySelectorAll<HTMLElement>(atomic).forEach(node => {
        if (!node.parentElement?.closest(atomic) && displayed(node)) {
          const rect = node.getBoundingClientRect();
          if (node instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'color', 'hidden'].includes(node.type)) {
            const text = node.value || node.placeholder;
            const computed = getComputedStyle(node);
            if (!text) return;
            const left = Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.borderLeftWidth);
            const right = Number.parseFloat(computed.paddingRight) + Number.parseFloat(computed.borderRightWidth);
            const textWidth = Math.max(0, rect.width - left - right);
            const lineHeight = Number.parseFloat(computed.lineHeight) || rect.height;
            add(new DOMRect(rect.x + left, rect.y + (rect.height - lineHeight) / 2, textWidth, lineHeight), 4);
          } else add(rect, Math.min(6, rect.height / 2));
        }
      });
      root.querySelectorAll<HTMLElement>(textSlots).forEach(node => {
        if (!node.parentElement?.closest(textSlots) && displayed(node) && node.textContent?.trim()) add(node.getBoundingClientRect(), 4);
      });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim() || node.parentElement?.closest(`${atomic},${textSlots}`)) continue;
        const parent = node.parentElement;
        if (!parent || parent.closest('.ov-sr-only,[hidden]') || !displayed(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const computed = getComputedStyle(parent);
        const lineHeight = Number.parseFloat(computed.lineHeight);
        const parentBounds = parent.getBoundingClientRect();
        Array.from(range.getClientRects()).forEach(rect => {
          // Figma TEXT bounds include the full line box, whereas DOM text ranges include font ink metrics.
          const height = Number.isFinite(lineHeight) ? lineHeight : rect.height;
          const y = Math.abs(parentBounds.height - height) < 1 ? parentBounds.y : rect.y - (height - rect.height) / 2;
          add(new DOMRect(rect.x, y, rect.width, height), 4);
        });
      }
      setBlocks(next);
    }
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    root.querySelectorAll('*').forEach(node => resize.observe(node));
    const mutations = new MutationObserver(measure);
    mutations.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    void document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => { disposed = true; resize.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); };
  }, [children]);
  return <div {...rest} {...visual} aria-hidden="true" inert data-shape={shape} data-animated={animated} data-content={children !== undefined || undefined}>
    {children !== undefined && <><div className="ov-skeleton-content" ref={content}>{children}</div><svg className="ov-skeleton-map" width="100%" height="100%" aria-hidden="true">{blocks.map((block, index) => <rect key={index} x={block.x} y={block.y} width={block.width} height={block.height} rx={block.radius}/>)}</svg></>}
  </div>;
}

export type SkeletonRegionProps = HTMLAttributes<HTMLDivElement> & { label?: string; children: ReactNode };
/** One readable status for a composition of decorative skeletons. */
export function SkeletonRegion({ label = 'Loading content…', children, ...rest }: SkeletonRegionProps) {
  return <div {...rest} aria-busy="true"><span role="status" className="ov-sr-only">{label}</span>{children}</div>;
}
