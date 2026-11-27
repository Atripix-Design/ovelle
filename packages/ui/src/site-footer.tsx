import { useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';
import { Switch } from './controls.js';
import { mountFooterTide } from './footer-tide.js';
import { useMaterial, useOvelleSettings } from './material.js';
import type { MaterialProps } from './material.js';

export type SiteFooterLink = { href: string; label: string };
export type SiteFooterLinkGroup = { label: string; links: readonly SiteFooterLink[] };

export type SiteFooterProps = MaterialProps & {
  className?: string;
  tideClassName?: string;
  contentClassName?: string;
  groups: readonly SiteFooterLinkGroup[];
  homeHref: string;
};

const motionQuery = '(prefers-reduced-motion: reduce)';
const preferenceKey = 'ovelle-footer-motion';

function pausedByChoice() {
  try { return localStorage.getItem(preferenceKey) === 'off'; } catch { return false; }
}

export function SiteFooter({ className, tideClassName, contentClassName, groups, homeHref, ...material }: SiteFooterProps) {
  // The ocean is an opaque palette surface. The motion switch can use a different material.
  const visual = useMaterial({ material: 'solid', reduceTransparency: false, className }, 'site-footer');
  const tide = useRef<HTMLCanvasElement>(null);
  const animator = useRef<ReturnType<typeof mountFooterTide>>(null);
  const lastMove = useRef({ x: 0, y: 0, time: -Infinity });
  const footerId = useId();
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(motionQuery).matches);
  const [paused, setPaused] = useState(pausedByChoice);
  const settings = useOvelleSettings();
  const deviceReducesMotion = reduced || settings.reduceMotion;
  const motion = !paused && !deviceReducesMotion;
  const dark = settings.theme === 'dark';

  useEffect(() => {
    const preference = matchMedia(motionQuery);
    const onChange = () => setReduced(preference.matches);
    preference.addEventListener('change', onChange);
    return () => preference.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!tide.current) return;
    const renderer = mountFooterTide(tide.current, { motion: false, dark });
    animator.current = renderer;
    return () => {
      renderer.dispose();
      animator.current = null;
    };
  }, [dark]);

  useEffect(() => { animator.current?.setMotion(motion); }, [motion, dark]);

  function onMove(event: PointerEvent) {
    if (!motion || event.pointerType === 'touch') return;
    const now = performance.now();
    const { clientX: x, clientY: y } = event;
    const previous = lastMove.current;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    if (now - previous.time < 95 || distance < 21) return;
    lastMove.current = { x, y, time: now };
    animator.current?.ripple(x, y, Math.min(30, 7 + distance * .15));
  }

  function wakeAtLink(event: PointerEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>) {
    if (!motion) return;
    const link = event.currentTarget.getBoundingClientRect();
    animator.current?.ripple(link.left + link.width / 2, link.bottom, 54);
  }

  return (
    <footer {...visual} data-ovelle-theme={settings.theme} id="site-footer" onPointerMove={onMove} onPointerDown={event => {
      if (event.pointerType === 'touch') animator.current?.ripple(event.clientX, event.clientY, 42);
    }}>
      <canvas ref={tide} className={['ov-footer-tide', tideClassName].filter(Boolean).join(' ')} aria-hidden="true"/>
      <div className={['ov-footer-inner', contentClassName].filter(Boolean).join(' ')}>
        <div className="ov-footer-content">
          <div className="ov-footer-brand">
            <a className="ov-footer-wordmark" href={homeHref} aria-label="Ovelle home" onPointerEnter={wakeAtLink} onFocus={wakeAtLink}>ovelle</a>
            <p className="ov-footer-tagline">More time for the people who show up.</p>
          </div>
          <nav className="ov-footer-nav" aria-label="Footer">
            {groups.map((group, index) => (
              <div key={group.label} className="ov-footer-group">
                <h2 id={`${footerId}-${index}`}>{group.label}</h2>
                <ul aria-labelledby={`${footerId}-${index}`}>
                  {group.links.map(link => <li key={link.href}><a href={link.href} onPointerEnter={wakeAtLink} onFocus={wakeAtLink}>{link.label}</a></li>)}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="ov-footer-meta">
          <small>© {new Date().getFullYear()} Ovelle</small>
          {deviceReducesMotion
            ? <small>Wave motion off · device setting</small>
            : <Switch {...material} wrapperClassName="ov-footer-motion" label="Wave motion" checked={motion} onChange={event => {
              const nextPaused = !event.currentTarget.checked;
              setPaused(nextPaused);
              try { localStorage.setItem(preferenceKey, nextPaused ? 'off' : 'on'); } catch { /* Storage is optional. */ }
            }}/>}
        </div>
      </div>
    </footer>
  );
}
