import { useEffect, useId, useRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps, Tone } from './material.js';
export { OvelleProvider, glassVariables, normalizeFrost } from './material.js';
export type { Material, MaterialProps, MaterialSettings, Tone } from './material.js';

type Visual = MaterialProps & { className?: string; style?: CSSProperties };
export type ButtonProps = Visual & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  variant?: 'primary' | 'secondary' | 'quiet'; tone?: Tone;
  state?: 'default' | 'loading' | 'success'; loadingLabel?: ReactNode; successLabel?: ReactNode;
};
export function Button({ material, glassFrost, reduceTransparency, className, style, variant = 'primary', tone = 'blue', state = 'default', loadingLabel = 'Working…', successLabel = 'Done', children, disabled, ...rest }: ButtonProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'button');
  return <button type="button" {...rest} {...visual} data-variant={variant} data-tone={tone} data-state={state} disabled={disabled || state === 'loading'} aria-busy={state === 'loading' || undefined}>{state === 'loading' ? loadingLabel : state === 'success' ? successLabel : children}</button>;
}
export type IconActionProps = Omit<ButtonProps, 'children'> & { icon: ReactNode; label: string };
export function IconAction({ icon, label, className, ...props }: IconActionProps) {
  return <Button {...props} className={['ov-icon-action', className].filter(Boolean).join(' ')} aria-label={label}><span aria-hidden="true">{icon}</span></Button>;
}
export type FieldProps = Visual & Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> & {
  label: string; wrapperClassName?: string; kind?: 'text' | 'search'; hint?: ReactNode; error?: ReactNode; success?: ReactNode;
};
export function Field({ material, glassFrost, reduceTransparency, className, style, label, wrapperClassName, kind = 'text', hint, error, success, id: givenId, ...rest }: FieldProps) {
  const generatedId = useId(), id = givenId ?? generatedId;
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'field');
  const message = error || success || hint;
  return <div className={["ov-field-group", wrapperClassName].filter(Boolean).join(" ")}><label htmlFor={id}>{label}</label><input type={kind} {...rest} {...visual} id={id} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={[rest['aria-describedby'], message ? `${id}-message` : null].filter(Boolean).join(' ') || undefined}/>{message && <p id={`${id}-message`} className="ov-hint" data-validation={error ? 'error' : success ? 'success' : undefined}>{message}</p>}</div>;
}
export interface SelectOption { value: string; label: string; disabled?: boolean }
export type SelectProps = Visual & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style' | 'children'> & { label: string; wrapperClassName?: string; options: readonly SelectOption[]; error?: ReactNode; hint?: ReactNode };
export function Select({ material, glassFrost, reduceTransparency, className, style, label, wrapperClassName, options, error, hint, id: givenId, ...rest }: SelectProps) {
  const generatedId = useId(), id = givenId ?? generatedId;
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'select');
  return <div className={["ov-field-group", wrapperClassName].filter(Boolean).join(" ")}><label htmlFor={id}>{label}</label><select {...rest} {...visual} id={id} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={[rest['aria-describedby'], error || hint ? `${id}-message` : null].filter(Boolean).join(' ') || undefined}>{options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>{(error || hint) && <p id={`${id}-message`} className="ov-hint" data-validation={error ? 'error' : undefined}>{error || hint}</p>}</div>;
}
export type FilterChipProps = ButtonProps & { selected?: boolean };
export function FilterChip({ selected = false, className, ...props }: FilterChipProps) {
  return <Button {...props} variant="secondary" className={['ov-filter-chip', className].filter(Boolean).join(' ')} aria-pressed={selected} data-selected={selected || undefined}/>;
}
export type CheckboxProps = Visual & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'style'> & { label: ReactNode; mixed?: boolean };
export function Checkbox({ material, glassFrost, reduceTransparency, className, style, label, mixed = false, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'check');
  return <label className="ov-check-label"><input {...rest} {...visual} ref={ref} type="checkbox" aria-checked={mixed ? 'mixed' : rest.checked}/><span>{label}</span></label>;
}
export type SwitchProps = Omit<CheckboxProps, 'mixed'>;
export function Switch({ material, glassFrost, reduceTransparency, className, style, label, ...rest }: SwitchProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'switch');
  return <label className="ov-check-label"><input {...rest} {...visual} type="checkbox" role="switch"/><span>{label}</span></label>;
}
export type NavigationItemProps = Visual & AnchorHTMLAttributes<HTMLAnchorElement> & { current?: boolean; disabled?: boolean };
export function NavigationItem({ material, glassFrost, reduceTransparency, className, style, current, disabled, href, onClick, ...rest }: NavigationItemProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'navigation-item');
  return <a {...rest} {...visual} href={disabled ? undefined : href} aria-current={current ? 'page' : undefined} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : rest.tabIndex} onClick={disabled ? event => event.preventDefault() : onClick}/>;
}
export type SectionLabelProps = Visual & HTMLAttributes<HTMLSpanElement> & { tone?: 'blue' | 'neutral' | 'success' };
export function SectionLabel({ material, glassFrost, reduceTransparency, className, style, tone = 'blue', ...rest }: SectionLabelProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'section-label');
  return <span {...rest} {...visual} data-tone={tone}/>;
}
export type StatusMessageProps = Visual & Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { tone?: 'info' | 'success' | 'warning' | 'error'; title: ReactNode; children: ReactNode };
export function StatusMessage({ material, glassFrost, reduceTransparency, className, style, tone = 'info', title, children, ...rest }: StatusMessageProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'status-message');
  return <div role={tone === 'error' ? 'alert' : 'status'} {...rest} {...visual} data-tone={tone}><strong>{title}</strong><div>{children}</div></div>;
}
export type FAQRowProps = Visual & Omit<HTMLAttributes<HTMLDetailsElement>, 'children'> & { number?: string; question: ReactNode; answer: ReactNode; open?: boolean };
export function FAQRow({ material, glassFrost, reduceTransparency, className, style, number, question, answer, ...rest }: FAQRowProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'faq-row');
  return <details {...rest} {...visual}><summary>{number && <span className="ov-faq-number">{number}</span>}<span>{question}</span><span className="ov-disclosure" aria-hidden="true">+</span></summary><div className="ov-faq-answer">{answer}</div></details>;
}
export type FeatureCardProps = Visual & Omit<HTMLAttributes<HTMLElement>, 'title'> & { surface?: 'white' | 'ice' | 'cream'; icon?: ReactNode; title: ReactNode; children: ReactNode; link?: ReactNode };
export function FeatureCard({ material, glassFrost, reduceTransparency, className, style, surface = 'white', icon, title, children, link, ...rest }: FeatureCardProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'feature-card');
  return <article {...rest} {...visual} data-surface={surface}>{icon && <span aria-hidden="true" className="ov-feature-icon">{icon}</span>}<h3>{title}</h3><div>{children}</div>{link && <div className="ov-card-link">{link}</div>}</article>;
}
export type DownloadActionProps = Visual & AnchorHTMLAttributes<HTMLAnchorElement> & { tone?: Tone; label: ReactNode; detail?: ReactNode; unavailable?: boolean; state?: 'default' | 'loading' | 'success'; loadingLabel?: ReactNode; successLabel?: ReactNode };
export function DownloadAction({ material, glassFrost, reduceTransparency, className, style, tone = 'blue', label, detail, unavailable, state = 'default', loadingLabel = 'Preparing download…', successLabel = 'Download ready', href, ...rest }: DownloadActionProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'download-action');
  return <a {...rest} {...visual} href={unavailable || state === 'loading' ? undefined : href} aria-disabled={unavailable || state === 'loading' || undefined} aria-busy={state === 'loading' || undefined} data-state={state} data-tone={tone} tabIndex={unavailable || state === 'loading' ? -1 : rest.tabIndex} onClick={unavailable || state === 'loading' ? event => event.preventDefault() : rest.onClick}><span><strong>{state === 'loading' ? loadingLabel : state === 'success' ? successLabel : label}</strong>{detail && <small>{detail}</small>}</span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></a>;
}
export type DownloadCardProps = Visual & Omit<HTMLAttributes<HTMLElement>, 'title'> & { platform: 'macOS' | 'Windows'; title?: ReactNode; children?: ReactNode; action: ReactNode; unavailable?: boolean };
export function DownloadCard({ material, glassFrost, reduceTransparency, className, style, platform, title, children, action, unavailable, ...rest }: DownloadCardProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'download-card');
  return <article {...rest} {...visual} data-unavailable={unavailable || undefined}><span className="ov-platform">{platform}</span><h3>{title ?? `Ovelle for ${platform}`}</h3><div>{children}</div><div className="ov-download-slot">{action}</div></article>;
}
export interface NavigationLink { label: string; href: string; current?: boolean }
export type SiteNavigationProps = Visual & HTMLAttributes<HTMLElement> & { brand: ReactNode; links: readonly NavigationLink[]; action?: ReactNode };
export function SiteNavigationDesktop({ material, glassFrost, reduceTransparency, className, style, brand, links, action, ...rest }: SiteNavigationProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'site-navigation-desktop');
  return <nav aria-label="Main" {...rest} {...visual}><div className="ov-brand">{brand}</div><div className="ov-nav-links">{links.map(link => <NavigationItem key={link.href} href={link.href} current={link.current}>{link.label}</NavigationItem>)}</div>{action}</nav>;
}
export function SiteNavigationMobile({ material, glassFrost, reduceTransparency, className, style, brand, links, action, ...rest }: SiteNavigationProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'site-navigation-mobile');
  return <nav aria-label="Main" {...rest} {...visual}><div className="ov-brand">{brand}</div><details><summary aria-label="Toggle navigation"><span>Menu</span><span className="ov-disclosure" aria-hidden="true">+</span></summary><div className="ov-mobile-menu">{links.map(link => <NavigationItem key={link.href} href={link.href} current={link.current}>{link.label}</NavigationItem>)}{action}</div></details></nav>;
}
export interface SegmentOption { value: string; label: string; disabled?: boolean }
export type SegmentedControlProps = Visual & { label: string; options: readonly SegmentOption[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; name?: string; disabled?: boolean };
export function SegmentedControl({ material, glassFrost, reduceTransparency, className, style, label, options, value, defaultValue, onValueChange, name, disabled }: SegmentedControlProps) {
  const id = useId();
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'segmented-control');
  return <fieldset {...visual} disabled={disabled}><legend className="ov-sr-only">{label}</legend>{options.map(option => <label key={option.value}><input type="radio" name={name ?? id} value={option.value} checked={value === undefined ? undefined : value === option.value} defaultChecked={value === undefined ? defaultValue === option.value : undefined} onChange={() => onValueChange?.(option.value)} disabled={option.disabled}/><span>{option.label}</span></label>)}</fieldset>;
}
export type ConfirmationDialogProps = Visual & { open: boolean; title: ReactNode; children: ReactNode; confirmLabel?: string; cancelLabel?: string; state?: 'default' | 'loading' | 'success' | 'error'; onConfirm: () => void; onOpenChange: (open: boolean) => void; error?: ReactNode; tone?: Tone };
export function ConfirmationDialog({ material, glassFrost, reduceTransparency, className, style, open, title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', state = 'default', onConfirm, onOpenChange, error, tone = 'blue' }: ConfirmationDialogProps) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'confirmation-dialog');
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); else if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} {...visual} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onCancel={event => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)}><h2 id={`${id}-title`}>{title}</h2><div id={`${id}-body`}>{children}</div>{error && <p role="alert" className="ov-hint" data-validation="error">{error}</p>}<div className="ov-dialog-actions"><Button variant="quiet" onClick={() => onOpenChange(false)}>{cancelLabel}</Button><Button tone={tone} state={state === 'loading' || state === 'success' ? state : 'default'} onClick={onConfirm}>{confirmLabel}</Button></div></dialog>;
}
