import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useMaterial } from './material.js';
import type { MaterialProps } from './material.js';

export type EmptyStateProps = MaterialProps & Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode;
  size?: 'compact' | 'regular'; align?: 'center' | 'start';
  contentClassName?: string; actionClassName?: string;
};
export function EmptyState({ material, glassFrost, reduceTransparency, className, style, title, children, icon, action, size = 'regular', align = 'center', contentClassName, actionClassName, ...rest }: EmptyStateProps) {
  const id = useId();
  const visual = useMaterial({ material, glassFrost, reduceTransparency, className, style }, 'empty-state');
  return <section aria-labelledby={`${id}-title`} {...rest} {...visual} data-size={size} data-align={align}>
    {icon && <div className="ov-empty-icon" aria-hidden="true">{icon}</div>}
    <div className={['ov-empty-content', contentClassName].filter(Boolean).join(' ')}><h3 id={`${id}-title`}>{title}</h3>{children && <div className="ov-empty-description">{children}</div>}</div>
    {action && <div className={['ov-empty-actions', actionClassName].filter(Boolean).join(' ')}>{action}</div>}
  </section>;
}
