import { NavigationItem } from './controls.js';
import type { NavigationItemProps } from './controls.js';
import { FigmaAsset } from './figma-assets.js';

export const ovelleRepositoryUrl = 'https://github.com/Atripix-Design/ovelle';
export type GitHubLinkProps = Omit<NavigationItemProps, 'children' | 'current'> & { layout?: 'compact' | 'menu'; contentClassName?: string };

/** External repository link composed from the shared navigation control. */
export function GitHubLink({ layout = 'compact', href = ovelleRepositoryUrl, className, contentClassName, target = '_blank', rel = 'noopener noreferrer', ...props }: GitHubLinkProps) {
  return <NavigationItem {...props} href={href} target={target} rel={rel} title="View Ovelle on GitHub (opens in a new tab)" className={['ov-github-link', className].filter(Boolean).join(' ')} data-layout={layout}>
    <FigmaAsset name="github-light.svg" darkName="github-dark.svg" className="ov-github-mark"/>
    {layout === 'menu' ? <><span className={['ov-mobile-link-content', contentClassName].filter(Boolean).join(' ')}><span>GitHub</span><small>View source on GitHub</small></span><FigmaAsset name="698d1.svg"/></> : <span className={contentClassName}>GitHub</span>}
  </NavigationItem>;
}
