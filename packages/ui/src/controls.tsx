import { useEffect, useId, useRef, useState } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps, Tone } from './material.js';
import { FigmaAsset } from './figma-assets.js';


const darkAssets: Record<string, string> = {
  'fef02.svg': 'bca0a.svg', '6bc96.svg': '09272.svg', '6cbea.svg': '502f2.svg',
  '1c15c.svg': 'abbf4.svg', 'cad4b.svg': '8d36c.svg', 'adaff.svg': 'cd9bc.svg',
  '0d03a.svg': '5d69e.svg', 'bc912.svg': '566f3.svg', '48ca7.svg': 'efb4d.svg', '79de1.svg': '005d6.svg',
  'b3140.svg': 'e2659.svg', 'a88ee.svg': '8ac42.svg', '57df6.svg': 'b387c.svg', '86e15.svg': '3d958.svg',
  '275c6.svg': '75501.svg', 'fbc9b.svg': '4b7f4.svg', 'd0787.svg': '51d13.svg',
  '73b9d.svg': '54163.svg', '30d5d.svg': 'e4842.svg', '6cade.svg': 'f3c06.svg',
  'b8648.svg': '3c1aa.svg', '2a5a3.svg': '9acab.svg', '3a7d2.svg': '32e17.svg',
  'b80de.svg': '7906e.svg', '8237e.svg': '83300.svg', '05213.svg': '3bce2.svg', '4802f.svg': '06700.svg',
};
/** Both skins are direct exports from linked source instances in their color mode. */
function SourceAsset({ name }: { name: string }) {
  const dark = darkAssets[name];
  return dark ? <span className="ov-source-asset"><FigmaAsset name={name} className="ov-source-light"/><FigmaAsset name={dark} className="ov-source-dark"/></span> : <FigmaAsset name={name}/>;
}

type Visual = MaterialProps & { className?: string; style?: CSSProperties };
const cx = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');
export type FieldProps = Visual & Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> & { label: string; wrapperClassName?: string; inputClassName?: string; kind?: 'text' | 'search'; supportingText?: 'visible' | 'hidden'; hint?: ReactNode; error?: ReactNode; success?: ReactNode };
export function Field({ material, glassFrost, reduceTransparency, className, style, label, wrapperClassName, inputClassName, kind = 'text', supportingText = 'visible', hint, error, success, id: givenId, ...rest }: FieldProps) {
  const generatedId = useId(), id = givenId ?? generatedId;
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'field');
  const message = error || success || (supportingText === 'visible' ? hint : undefined);
  return <div className={cx('ov-field-group ov-field-source', wrapperClassName)} data-supporting-text={supportingText}><label htmlFor={id}>{label}</label><div {...visual} data-validation={error ? 'error' : success ? 'success' : undefined} data-disabled={rest.disabled || undefined}>{kind === 'search' && <SourceAsset name="b8648.svg" />}<input type={kind} {...rest} id={id} className={inputClassName} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={[rest['aria-describedby'], message ? `${id}-message` : null].filter(Boolean).join(' ') || undefined}/>{error ? <SourceAsset name="2a5a3.svg" /> : success ? <SourceAsset name="3a7d2.svg" /> : null}</div>{message && <p id={`${id}-message`} className="ov-hint" data-validation={error ? 'error' : success ? 'success' : undefined}>{message}</p>}</div>;
}
export interface SelectOption { value: string; label: string; disabled?: boolean }
export type SelectProps = Visual & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style' | 'children'> & { label: string; wrapperClassName?: string; menuClassName?: string; options: readonly SelectOption[]; error?: ReactNode; hint?: ReactNode; onValueChange?: (value: string) => void };
export function Select({ material, glassFrost, reduceTransparency, className, style, label, wrapperClassName, menuClassName, options, error, hint, id: givenId, value, defaultValue, onChange, onValueChange, disabled, ...rest }: SelectProps) {
  const generatedId = useId(), id = givenId ?? generatedId;
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const selected = String(value ?? internal);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'select');
  const menuVisual = useMaterial({ material, glassFrost, reduceTransparency, className: menuClassName }, 'select-menu');
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (!open) return; const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside); }, [open]);
  const show = () => { const index = options.findIndex(option => option.value === selected && !option.disabled); setActive(index >= 0 ? index : options.findIndex(option => !option.disabled)); setOpen(true); };
  const choose = (index: number) => { const option = options[index]; if (!option || option.disabled || disabled) return; setInternal(option.value); if (native.current) { native.current.value = option.value; native.current.dispatchEvent(new Event('change', { bubbles: true })); } onValueChange?.(option.value); setOpen(false); trigger.current?.focus(); };
  const step = (direction: number) => { let next = active; for (let count = 0; count < options.length; count++) { next = (next + direction + options.length) % options.length; if (!options[next]?.disabled) { setActive(next); break; } } };
  return <div ref={root} className={cx('ov-field-group ov-select-source', wrapperClassName)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}><label id={`${id}-label`} htmlFor={id}>{label}</label><select {...rest} ref={native} className="ov-select-native" value={selected} disabled={disabled} tabIndex={-1} aria-hidden="true" onChange={event => onChange?.(event)} onInvalid={event => { event.preventDefault(); trigger.current?.focus(); rest.onInvalid?.(event); }}>{options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select><button type="button" {...visual} ref={trigger} id={id} disabled={disabled} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} aria-labelledby={`${id}-label`} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={[rest['aria-describedby'], error || hint ? `${id}-message` : null].filter(Boolean).join(' ') || undefined} data-open={open || undefined} data-validation={error ? 'error' : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); if (!open) show(); else if (event.key === 'Home') setActive(options.findIndex(o => !o.disabled)); else if (event.key === 'End') setActive(options.reduce((last, option, index) => option.disabled ? last : index, -1)); else step(event.key === 'ArrowDown' ? 1 : -1); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else show(); } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { const next = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(event.key.toLowerCase())); if (next >= 0) { event.preventDefault(); if (!open) show(); setActive(next); } } }}><span>{options.find(option => option.value === selected)?.label ?? ''}</span><SourceAsset name={disabled ? '05213.svg' : 'b80de.svg'} /></button>{(error || hint) && <p id={`${id}-message`} className="ov-hint" data-validation={error ? 'error' : undefined}>{error || hint}</p>}{open && <div {...menuVisual} role="listbox" id={`${id}-listbox`} aria-labelledby={`${id}-label`}>{options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === selected} aria-disabled={option.disabled || undefined} data-active={index === active || undefined} onPointerMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}><span>{option.label}</span>{option.value === selected && <SourceAsset name="8237e.svg" />}</div>)}</div>}</div>;
}
export type FilterChipProps = Visual & ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; tone?: Tone; variant?: 'primary' | 'secondary' | 'quiet'; size?: 'regular' | 'compact'; state?: 'default' | 'loading' | 'success'; loadingLabel?: ReactNode; successLabel?: ReactNode };
export function FilterChip({ selected = false, tone = 'blue', material, glassFrost, reduceTransparency, className, style, children, variant: _variant, size: _size, state: _state, loadingLabel: _loadingLabel, successLabel: _successLabel, ...rest }: FilterChipProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'filter-chip');
  return <button type="button" {...rest} {...visual} data-tone={tone} aria-pressed={selected}>{selected && <SourceAsset name={tone === 'neutral' ? '4802f.svg' : 'b3140.svg'} />}<span>{children}</span></button>;
}
export type CheckboxProps = Visual & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'style'> & { label: ReactNode; mixed?: boolean; wrapperClassName?: string };
export function Checkbox({ material, glassFrost, reduceTransparency, className, style, label, mixed = false, wrapperClassName, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'check');
  return <label className={cx('ov-check-label ov-checkbox-source', wrapperClassName)}><input {...rest} ref={ref} type="checkbox" aria-checked={mixed ? 'mixed' : rest.checked}/><span {...visual} aria-hidden="true" data-mixed={mixed || undefined}><span className="ov-check-on"><SourceAsset name={rest.disabled ? 'a88ee.svg' : 'b3140.svg'} /></span><span className="ov-check-mixed"><SourceAsset name={rest.disabled ? '86e15.svg' : '57df6.svg'} /></span></span><span>{label}</span></label>;
}
export type SwitchProps = Omit<CheckboxProps, 'mixed'>;
export function Switch({ material, glassFrost, reduceTransparency, className, style, label, wrapperClassName, ...rest }: SwitchProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'switch');
  const liquid = visual['data-material'] !== 'solid' && !visual['data-reduce-transparency'];
  const off = rest.disabled ? '6cbea.svg' : liquid ? '0d03a.svg' : 'fef02.svg', on = rest.disabled ? 'adaff.svg' : liquid ? '48ca7.svg' : '1c15c.svg';
  return <label className={cx('ov-check-label ov-switch-source', wrapperClassName)}><input {...rest} type="checkbox" role="switch"/><span {...visual} aria-hidden="true"><span className="ov-switch-off"><SourceAsset name={off} /></span><span className="ov-switch-on"><SourceAsset name={on} /></span><span className="ov-switch-off-focus"><SourceAsset name={liquid ? 'bc912.svg' : '6bc96.svg'} /></span><span className="ov-switch-on-focus"><SourceAsset name={liquid ? '79de1.svg' : 'cad4b.svg'} /></span></span><span>{label}</span></label>;
}
export type NavigationItemProps = Visual & AnchorHTMLAttributes<HTMLAnchorElement> & { current?: boolean; disabled?: boolean };
export function NavigationItem({ material, glassFrost, reduceTransparency, className, style, current, disabled, href, onClick, ...rest }: NavigationItemProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'navigation-item');
  return <a {...rest} {...visual} href={disabled ? undefined : href} aria-current={current ? 'page' : undefined} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : rest.tabIndex} onClick={disabled ? event => event.preventDefault() : onClick}/>;
}
export type SectionLabelProps = Visual & HTMLAttributes<HTMLSpanElement> & { tone?: 'blue' | 'neutral' | 'success' };
export function SectionLabel({ material, glassFrost, reduceTransparency, className, style, tone = 'blue', children, ...rest }: SectionLabelProps) {
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'section-label');
  const liquid = visual['data-material'] !== 'solid' && !visual['data-reduce-transparency'];
  return <span {...rest} {...visual} data-tone={tone}><span className="ov-section-marker" aria-hidden="true"><SourceAsset name={liquid ? tone === 'success' ? '6cade.svg' : tone === 'neutral' ? '30d5d.svg' : '73b9d.svg' : tone === 'success' ? 'd0787.svg' : tone === 'neutral' ? 'fbc9b.svg' : '275c6.svg'} /></span><span>{children}</span></span>;
}
export interface SegmentOption { value: string; label: string; disabled?: boolean }
export type SegmentedControlProps = Visual & { label: string; options: readonly SegmentOption[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; name?: string; disabled?: boolean };
export function SegmentedControl({ material, glassFrost, reduceTransparency, className, style, label, options, value, defaultValue, onValueChange, name, disabled }: SegmentedControlProps) {
  const id = useId();
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'segmented-control');
  return <fieldset {...visual} disabled={disabled}><legend className="ov-sr-only">{label}</legend>{options.map(option => <label key={option.value}><input type="radio" name={name ?? id} value={option.value} checked={value === undefined ? undefined : value === option.value} defaultChecked={value === undefined ? (defaultValue ?? options[0]?.value) === option.value : undefined} onChange={() => onValueChange?.(option.value)} disabled={option.disabled}/><span>{option.label}</span></label>)}</fieldset>;
}
