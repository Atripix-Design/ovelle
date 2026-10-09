import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps, Tone } from './material.js';
import { FigmaAsset } from './figma-assets.js';
export { OvelleProvider, glassVariables, normalizeFrost } from './material.js';
export type { Material, MaterialProps, MaterialSettings, Tone } from './material.js';

type Visual = MaterialProps & { className?: string; style?: CSSProperties };
export type ButtonProps = Visual & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  variant?: 'primary' | 'secondary' | 'quiet'; tone?: Tone; size?: 'regular' | 'compact';
  state?: 'default' | 'loading' | 'success'; loadingLabel?: ReactNode; successLabel?: ReactNode;
  surfaceClassName?: string;
};
function stateAsset(variant: string, tone: Tone, state: 'loading' | 'success', dark = false) {
  if (dark) {
    if (variant === 'primary') return state === 'loading' ? 'd0c62.svg' : 'e2659.svg';
    return ({ blue: ['84558.svg', '83300.svg'], neutral: ['63aef.svg', '06700.svg'], danger: ['9dfdd.svg', '3c5dc.svg'] }[tone])[state === 'loading' ? 0 : 1];
  }
  if (variant === 'primary') return state === 'loading' ? 'f37f0.svg' : 'b3140.svg';
  return ({ blue: ['41d2c.svg', '8237e.svg'], neutral: ['17546.svg', '4802f.svg'], danger: ['ee765.svg', '21c9b.svg'] }[tone])[state === 'loading' ? 0 : 1];
}
export function Button({ material, glassFrost, reduceTransparency, className, style, surfaceClassName, variant = 'primary', tone = 'blue', size = 'regular', state = 'default', loadingLabel = 'Saving…', successLabel = 'Saved', children, disabled, ...rest }: ButtonProps) {
  const settings = { material, glassFrost, reduceTransparency };
  const outer = useMaterial({ ...settings, className, style }, 'button');
  const surface = useMaterial({ ...settings, className: surfaceClassName }, 'action-surface');
  return <button type="button" {...rest} {...outer} data-variant={variant} data-size={size} data-tone={tone} data-state={state} disabled={disabled || state === 'loading'} aria-busy={state === 'loading' || undefined}>
    <span {...surface}>{state !== 'default' && <FigmaAsset className={state === 'loading' ? 'ov-loading-icon' : undefined} name={stateAsset(variant, tone, state)} darkName={stateAsset(variant, tone, state, true)}/>}<span>{state === 'loading' ? loadingLabel : state === 'success' ? successLabel : children}</span></span>
  </button>;
}
export type IconActionProps = Omit<ButtonProps, 'children'> & { icon?: ReactNode; label: string };
export function IconAction({ icon, label, className, tone = 'blue', disabled, ...props }: IconActionProps) {
  return <Button {...props} disabled={disabled} tone={tone} variant="quiet" className={['ov-icon-action', className].filter(Boolean).join(' ')} aria-label={label}><span aria-hidden="true">{icon ?? <FigmaAsset name={disabled ? 'fc82b.svg' : tone === 'neutral' ? '0cef6.svg' : '689eb.svg'} darkName={disabled ? 'c3765.svg' : tone === 'neutral' ? 'a8f05.svg' : '25e3a.svg'}/>}</span></Button>;
}
export type DownloadActionProps = Visual & AnchorHTMLAttributes<HTMLAnchorElement> & { tone?: Tone; label: ReactNode; /** Optional caller content, separate from the Figma default single-line label. */ detail?: ReactNode; unavailable?: boolean; state?: 'default' | 'loading' | 'success'; loadingLabel?: ReactNode; successLabel?: ReactNode; surfaceClassName?: string };
export function DownloadAction({ material, glassFrost, reduceTransparency, className, style, surfaceClassName, tone = 'blue', label, detail, unavailable, state = 'default', loadingLabel = 'Preparing download…', successLabel = 'Download ready', href, onClick, ...rest }: DownloadActionProps) {
  const settings = { material, glassFrost, reduceTransparency };
  const outer = useMaterial({ ...settings, className, style }, 'download-action');
  const surface = useMaterial({ ...settings, className: surfaceClassName }, 'action-surface');
  const blocked = unavailable || state === 'loading';
  return <a {...rest} {...outer} href={blocked ? undefined : href} aria-disabled={blocked || undefined} aria-busy={state === 'loading' || undefined} data-state={state} data-tone={tone} tabIndex={blocked ? -1 : rest.tabIndex} onClick={blocked ? event => event.preventDefault() : onClick}>
    <span {...surface}><FigmaAsset className={state === 'loading' ? 'ov-loading-icon' : undefined} name={state === 'loading' ? 'f37f0.svg' : state === 'success' ? 'b3140.svg' : unavailable ? '785a7.svg' : '1c893.svg'} darkName={state === 'loading' ? 'd0c62.svg' : state === 'success' ? 'e2659.svg' : unavailable ? 'e630f.svg' : '3bbf4.svg'}/><span className="ov-download-label">{state === 'loading' ? loadingLabel : state === 'success' ? successLabel : label}{detail && <small>{detail}</small>}</span></span>
  </a>;
}

export { Field, Select, FilterChip, Checkbox, Switch, NavigationItem, SectionLabel, SegmentedControl } from './controls.js';
export type { FieldProps, SelectProps, SelectOption, FilterChipProps, CheckboxProps, SwitchProps, NavigationItemProps, SectionLabelProps, SegmentedControlProps, SegmentOption } from './controls.js';
export { StatusMessage, FAQRow, FeatureCard, DownloadCard, SiteNavigationDesktop, SiteNavigationMobile, ConfirmationDialog } from './composites.js';
export type { StatusMessageProps, FAQRowProps, FeatureCardProps, DownloadCardProps, SiteNavigationProps, NavigationLink, ConfirmationDialogProps } from './composites.js';
export { DatePicker } from './date-picker.js';
export type { DatePickerProps } from './date-picker.js';
export { Pagination } from './pagination.js';
export type { PaginationProps } from './pagination.js';
export { EmptyState } from './empty-state.js';
export type { EmptyStateProps } from './empty-state.js';
export { Skeleton, SkeletonRegion } from './skeleton.js';
export type { SkeletonProps, SkeletonRegionProps } from './skeleton.js';
