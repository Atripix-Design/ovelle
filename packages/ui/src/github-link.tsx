import { NavigationItem } from './controls.js';
import type { NavigationItemProps } from './controls.js';
import { FigmaAsset } from './figma-assets.js';
import { LoadingBoundary } from './skeleton.js';

export const ovelleRepositoryUrl = 'https://github.com/Atripix-Design/ovelle';
export type GitHubLinkProps = Omit<NavigationItemProps, 'children' | 'current'> & { layout?: 'compact' | 'menu'; contentClassName?: string; /** undefined omits the badge; null means unavailable. Zero is valid. */ starCount?: number | null; starsLoading?: boolean };

/** External repository link composed from the shared navigation control. */
export function GitHubLink({ layout = 'compact', href = ovelleRepositoryUrl, className, contentClassName, starCount, starsLoading = false, target = '_blank', rel = 'noopener noreferrer', ...props }: GitHubLinkProps) {
  const showStars = starCount !== undefined || starsLoading;
  const count = typeof starCount === 'number' && Number.isSafeInteger(starCount) && starCount >= 0 ? starCount : null;
  const formatted = count === null ? '—' : new Intl.NumberFormat('en', count >= 1000 ? { notation: 'compact', maximumSignificantDigits: 2 } : { maximumFractionDigits: 0 }).format(count).toLowerCase();
  const stars = showStars && <LoadingBoundary loading={starsLoading} label="Loading GitHub stars" regionClassName="ov-github-stars-boundary" material={props.material} glassFrost={props.glassFrost} reduceTransparency={props.reduceTransparency}><span className="ov-github-stars" title={count === null ? 'Star count unavailable' : `${count.toLocaleString('en')} GitHub ${count === 1 ? 'star' : 'stars'}`}><span aria-hidden="true">{formatted}</span><span className="ov-sr-only">{count === null ? 'Star count unavailable' : `${count.toLocaleString('en')} ${count === 1 ? 'star' : 'stars'}`}</span></span></LoadingBoundary>;
  return <NavigationItem {...props} href={href} target={target} rel={rel} title="View Ovelle on GitHub (opens in a new tab)" className={['ov-github-link', className].filter(Boolean).join(' ')} data-layout={layout} data-stars={showStars || undefined}>
    <FigmaAsset name="github-light.svg" darkName="github-dark.svg" className="ov-github-mark"/>
    {layout === 'menu' ? <><span className={['ov-mobile-link-content', contentClassName].filter(Boolean).join(' ')}><span>GitHub</span><small>View source on GitHub</small></span>{stars}<FigmaAsset name="698d1.svg"/></> : <><span className={contentClassName}>GitHub</span>{stars}</>}
  </NavigationItem>;
}
