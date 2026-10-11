import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Button } from './index.js';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

export type DatePickerProps = MaterialProps & {
  label: string; value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  min?: string; max?: string; disabled?: boolean; required?: boolean; name?: string;
  hint?: ReactNode; error?: ReactNode; placeholder?: string; locale?: string;
  className?: string; style?: CSSProperties; wrapperClassName?: string; calendarClassName?: string;
};
/** Local calendar dates, never UTC timestamps. */
export function parseCalendarDate(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
}
export function calendarDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const shifted = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
const monthStart = (date: Date) => { const result = new Date(date); result.setDate(1); return result; };
const shiftedMonth = (date: Date, months: number) => {
  const result = monthStart(date); result.setMonth(result.getMonth() + months);
  const last = new Date(result); last.setMonth(last.getMonth() + 1); last.setDate(0);
  result.setDate(Math.min(date.getDate(), last.getDate())); return result;
};
export function DatePicker({ label, value, defaultValue = '', onValueChange, min, max, disabled, required, name, hint, error, placeholder = 'Choose a date', locale = 'en-US', material, glassFrost, reduceTransparency, className, style, wrapperClassName, calendarClassName }: DatePickerProps) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [internal, setInternal] = useState(defaultValue), [open, setOpen] = useState(false);
  const selected = value ?? internal;
  const lower = parseCalendarDate(min), upper = parseCalendarDate(max);
  const clamp = (date: Date) => lower && date < lower ? lower : upper && date > upper ? upper : date;
  const [focused, setFocused] = useState(() => clamp(parseCalendarDate(selected) ?? new Date()));
  const [month, setMonth] = useState(() => monthStart(focused));
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'date-picker');
  const panel = useMaterial({ material, glassFrost, reduceTransparency, className: calendarClassName }, 'calendar');
  const appearance = { material, glassFrost, reduceTransparency };
  const available = (date: Date) => (!lower || date >= lower) && (!upper || date <= upper);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${calendarDate(focused)}"]`)?.focus();
  }, [open, focused, month]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function move(date: Date) { const next = clamp(date); setFocused(next); setMonth(monthStart(next)); }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => shifted(date, -1), ArrowRight: () => shifted(date, 1),
      ArrowUp: () => shifted(date, -7), ArrowDown: () => shifted(date, 7),
      Home: () => shifted(date, -date.getDay()), End: () => shifted(date, 6 - date.getDay()),
      PageUp: () => shiftedMonth(date, event.shiftKey ? -12 : -1), PageDown: () => shiftedMonth(date, event.shiftKey ? 12 : 1),
    };
    if (moves[event.key]) { event.preventDefault(); move(moves[event.key]()); }
  }
  const first = shifted(month, -month.getDay());
  // Six stable rows prevent the popover moving while navigating months.
  return <div className={['ov-field-group ov-date-group', wrapperClassName].filter(Boolean).join(' ')} ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}{required ? ' *' : ''}</label>
    <input type="hidden" name={name} value={selected}/>
    <button {...visual} type="button" id={`${id}-trigger`} ref={trigger} disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open && !disabled ? `${id}-calendar` : undefined} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-message` : undefined} onClick={() => { if (!open) move(parseCalendarDate(selected) ?? new Date()); setOpen(!open); }}><span id={`${id}-value`}>{parseCalendarDate(selected)?.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) ?? placeholder}</span><span aria-hidden="true">▦</span></button>
    {(error || hint) && <p className="ov-hint" id={`${id}-message`} data-validation={error ? 'error' : undefined}>{error || hint}</p>}
    {open && !disabled && <div {...panel} id={`${id}-calendar`} role="dialog" aria-label={`${label}: choose a date`}>
      <div className="ov-calendar-header"><Button {...appearance} size="compact" variant="quiet" aria-label="Previous month" disabled={Boolean(lower && month <= monthStart(lower))} onClick={() => move(shiftedMonth(focused, -1))}>‹</Button><strong aria-live="polite" id={`${id}-month`}>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong><Button {...appearance} size="compact" variant="quiet" aria-label="Next month" disabled={Boolean(upper && month >= monthStart(upper))} onClick={() => move(shiftedMonth(focused, 1))}>›</Button></div>
      <table className="ov-calendar-grid" role="grid" aria-labelledby={`${id}-month`}><thead><tr>{Array.from({ length: 7 }, (_, day) => <th key={day} scope="col"><abbr title={new Date(2026, 0, 4 + day).toLocaleDateString(locale, { weekday: 'long' })}>{new Date(2026, 0, 4 + day).toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, day) => {
        const date = shifted(first, week * 7 + day), key = calendarDate(date), chosen = selected === key;
        return <td key={key} aria-selected={chosen}><Button {...appearance} size="compact" className="ov-calendar-day" variant={chosen ? 'primary' : 'quiet'} disabled={!available(date)} tabIndex={calendarDate(focused) === key ? 0 : -1} data-date={key} data-outside={date.getMonth() !== month.getMonth() || undefined} aria-label={date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} aria-current={key === calendarDate(new Date()) ? 'date' : undefined} onKeyDown={event => keyDown(event, date)} onClick={() => { if (value === undefined) setInternal(key); onValueChange?.(key); setOpen(false); trigger.current?.focus(); }}>{date.getDate()}</Button></td>;
      })}</tr>)}</tbody></table>
      <Button {...appearance} variant="quiet" className="ov-calendar-clear" disabled={required || !selected} onClick={() => { if (value === undefined) setInternal(''); onValueChange?.(''); setOpen(false); trigger.current?.focus(); }}>Clear date</Button>
    </div>}
  </div>;
}
