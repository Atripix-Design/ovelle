import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Checkbox, ConfirmationDialog, DatePicker, DownloadAction, DownloadCard, EmptyState, FAQRow, FeatureCard, Field, FilterChip, IconAction, NavigationItem, OvelleProvider, Pagination, SectionLabel, SegmentedControl, Select, SiteNavigationDesktop, SiteNavigationMobile, Skeleton, SkeletonRegion, StatusMessage, Switch } from '@ovelle/ui';
import './component-preview.css';
import LoadingPreview from './LoadingPreview';
import FidelityVariants from './FidelityVariants';

const noop = () => {};
export default function ComponentPreview() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [glass, setGlass] = useState(false), [frost, setFrost] = useState(35), [opaque, setOpaque] = useState(false);
  const [date, setDate] = useState('2026-10-08'), [page, setPage] = useState(4);
  const specimens: [string, ReactNode][] = [
    ['Button', <Button>Save contact</Button>],
    ['Icon action', <IconAction label="Next"/>],
    ['Field', <Field label="Contact name" placeholder="Enter contact name" hint="Use the name your team will recognize."/>],
    ['Select', <Select label="Contact status" hint="Filter the people in your workspace." options={[{ value: 'all', label: 'All contacts' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]}/>],
    ['Filter chip', <FilterChip>Active</FilterChip>],
    ['Checkbox', <Checkbox label="Include in reports"/>],
    ['Switch', <Switch label="Email reminders"/>],
    ['Navigation item', <NavigationItem href="#components">Features</NavigationItem>],
    ['Section label', <SectionLabel>How it works</SectionLabel>],
    ['Status message', <StatusMessage title="Your draft is saved">Continue when you’re ready.</StatusMessage>],
    ['FAQ row', <FAQRow question="How do I install Ovelle?" answer="Choose the installer for macOS or Windows, then follow the setup steps."/>],
    ['Feature card', <FeatureCard title="Keep people in context" href="#components">Contacts, notes, and follow-ups together, so your team knows what comes next.</FeatureCard>],
    ['Download card', <DownloadCard platform="macOS" href="#components"/>],
    ['Download action', <DownloadAction label="Download Ovelle" href="#components"/>],
    ['Site navigation / Desktop', <SiteNavigationDesktop brand="ovelle" links={[{ label: 'Home', href: '#components', current: true }, { label: 'Features', href: '#features' }, { label: 'Download', href: '#download' }]} action={<Button>Get Ovelle</Button>}/>],
    ['Site navigation / Mobile', <SiteNavigationMobile brand="ovelle" links={[{ label: 'Home', href: '#components', current: true }]}/>],
    ['Segmented control', <SegmentedControl label="View" options={[{ value: 'contacts', label: 'Contacts' }, { value: 'companies', label: 'Companies' }, { value: 'campaigns', label: 'Campaigns' }]} defaultValue="contacts"/>],
    ['Confirmation dialog', <ConfirmationDialog open={false} onOpenChange={noop} onConfirm={noop} title="Review selected contacts">Check your selection before continuing.</ConfirmationDialog>],
    ['Date picker', <DatePicker label="Date" defaultValue="2026-10-08"/>],
    ['Pagination', <Pagination page={1} pageCount={8} onPageChange={noop}/>],
    ['Empty state', <EmptyState title="Nothing here yet" action={<Button>Add item</Button>}>When items are added, they will appear here.</EmptyState>],
  ];
  return <OvelleProvider theme={theme} material={glass ? 'liquid-glass' : 'solid'} glassFrost={frost} reduceTransparency={opaque}>
    <main className="component-preview" id="components">
      <header><p>Ovelle / Components</p><h1>Content, waiting.</h1><p>Source components and dynamic loading from their actual layout.</p></header>
      <div className="preview-settings"><Switch label="Dark theme" checked={theme === 'dark'} onChange={event => setTheme(event.target.checked ? 'dark' : 'light')}/><Switch label="Liquid Glass" checked={glass} onChange={event => setGlass(event.target.checked)}/><Switch label="Reduce transparency" checked={opaque} onChange={event => setOpaque(event.target.checked)}/><label>Frost {frost}<input type="range" min="0" max="100" value={frost} onChange={event => setFrost(Number(event.target.value))}/></label></div>
      <LoadingPreview/>
      <section className="preview-interactive"><h2>Date picker and pagination</h2><DatePicker label="Report date" value={date} onValueChange={setDate} min="2026-10-03" max="2026-11-20"/><p>Selected date: <output>{date || 'None'}</output></p><Pagination page={page} pageCount={12} onPageChange={setPage}/><p>Selected page: <output>{page}</output></p></section>
      <section><h2>Contextual empty regions</h2><div className="preview-empty-grid"><div><h3>Search results</h3><Field label="Search" kind="search" defaultValue="Morgan"/><EmptyState size="compact" align="start" title="No matching contacts" action={<Button variant="secondary">Clear search</Button>}>Try a different name or clear your search.</EmptyState></div><div><h3>Desktop downloads</h3><EmptyState align="start" title="No builds available" action={<Button variant="secondary">Check again</Button>}>Mac and Windows builds will appear here when a release is ready.</EmptyState></div></div></section>
      <section><h2>Dynamic component layout checks</h2><p>Content stays in place as text wraps. Loading controls cannot receive focus.</p><div className="preview-specimens">{specimens.map(([name, component]) => <article className="preview-specimen" key={name} data-specimen={name}><h3>{name}</h3><div className="preview-pair"><div className="preview-live">{component}</div><SkeletonRegion label={`Loading ${name.toLowerCase()}…`}><Skeleton className="preview-skeleton">{component}</Skeleton></SkeletonRegion></div></article>)}</div></section>
    <FidelityVariants/>
    </main>
  </OvelleProvider>;
}
