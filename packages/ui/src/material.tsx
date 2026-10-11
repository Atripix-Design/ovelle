import { createContext, useContext } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type Material = 'solid' | 'liquid-glass' | 'soft-glass';
export type Tone = 'blue' | 'neutral' | 'danger';
export interface MaterialProps {
  material?: Material;
  /** Continuous scale: 0 clear liquid → 100 frosted. Default 35. */
  glassFrost?: number;
  reduceTransparency?: boolean;
}
export interface MaterialSettings extends MaterialProps {
  theme?: 'light' | 'dark';
  reduceMotion?: boolean;
}
const Settings = createContext<MaterialSettings>({});
export function useOvelleSettings(): MaterialSettings { return useContext(Settings); }
export function OvelleProvider({ children, className, style, ...settings }: MaterialSettings & Pick<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { children: ReactNode }) {
  return <Settings.Provider value={settings}><div className={className} style={style} data-ovelle-theme={settings.theme} data-ovelle-reduced-motion={settings.reduceMotion || undefined}>{children}</div></Settings.Provider>;
}
export function normalizeFrost(value = 35): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 35;
}
export function glassVariables(value = 35): CSSProperties {
  const t = normalizeFrost(value) / 100;
  return {
    '--ov-frost': t,
    '--ov-blur': `${24 * t}px`,
    '--ov-panel-blur': `${40 * t}px`,
    '--ov-menu-blur': `${8 + 24 * t}px`,
    '--ov-micro-blur': `${2 + 4 * t}px`,
    '--ov-alpha': .62 + .34 * t,
    '--ov-menu-alpha': .88 + .08 * t,
    '--ov-heavy-alpha': .92 + .04 * t,
    '--ov-sheen': 1 - .4 * t,
    '--ov-saturation': 1.8 - .8 * t,
  } as CSSProperties;
}
export function useMaterial(props: MaterialProps & { className?: string; style?: CSSProperties }, component: string): { className: string; style: CSSProperties; 'data-material': Material; 'data-reduce-transparency': boolean | undefined } {
  const settings = useContext(Settings);
  const { material = settings.material ?? 'solid', glassFrost = settings.glassFrost ?? 35, reduceTransparency = settings.reduceTransparency ?? false } = props;
  return {
    className: ['ov', `ov-${component}`, props.className].filter(Boolean).join(' '),
    style: { ...glassVariables(glassFrost), ...props.style },
    'data-material': material,
    'data-reduce-transparency': reduceTransparency || undefined,
  };
}
