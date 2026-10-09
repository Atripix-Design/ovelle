import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '../dist/index.js';
const manifest = JSON.parse(readFileSync(new URL('../figma-manifest.json', import.meta.url)));
const render = (component, props, children) => renderToStaticMarkup(h(component, props, children));

test('every public Figma asset has a distinct React export and mapping', () => {
  assert.equal(manifest.components.length, 18);
  assert.equal(new Set(manifest.components.map(c => c.id)).size, 18);
  for (const component of manifest.components) {
    assert.equal(typeof ui[component.export], 'function', component.export);
    assert.equal(component.propertyMapping.Material, 'material');
  }
});
test('glass supports ten monotonic levels, decimals, bounds and invalid values', () => {
  const levels = [0, 11.1, 22.2, 33.3, 44.4, 55.6, 66.7, 77.8, 88.9, 100];
  let lastBlur = -1, lastAlpha = -1;
  for (const value of levels) {
    const vars = ui.glassVariables(value);
    assert.ok(parseFloat(vars['--ov-panel-blur']) > lastBlur);
    assert.ok(vars['--ov-alpha'] > lastAlpha);
    lastBlur = parseFloat(vars['--ov-panel-blur']); lastAlpha = vars['--ov-alpha'];
  }
  assert.equal(ui.glassVariables(0)['--ov-panel-blur'], '0px');
  assert.equal(ui.glassVariables(100)['--ov-panel-blur'], '40px');
  assert.equal(ui.glassVariables(37.5)['--ov-panel-blur'], '15px');
  assert.equal(ui.normalizeFrost(-5), 0); assert.equal(ui.normalizeFrost(105), 100);
  assert.equal(ui.normalizeFrost(NaN), 35); assert.equal(ui.normalizeFrost(Infinity), 35);
});
test('provider applies material settings with independent component overrides', () => {
  const html = render(ui.OvelleProvider, { material: 'liquid-glass', glassFrost: 100, reduceTransparency: true, theme: 'dark' }, [h(ui.Button, { key: 1 }, 'Inherited'), h(ui.Button, { key: 2, material: 'solid', glassFrost: 0, reduceTransparency: false }, 'Override')]);
  assert.match(html, /data-ovelle-theme="dark"/);
  assert.match(html, /data-material="liquid-glass" data-reduce-transparency="true"/);
  assert.match(html, /--ov-panel-blur:40px/);
  assert.match(html, /--ov-panel-blur:0px/);
  assert.match(html, /data-material="solid"/);
});
test('loading disables submission and supplies a readable busy label', () => {
  const html = render(ui.Button, { state: 'loading', loadingLabel: 'Saving', className: 'w-full' }, 'Save');
  assert.match(html, /type="button"/); assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/); assert.match(html, />Saving<\/button>/);
  assert.match(html, /ov-button w-full/);
  assert.match(render(ui.Button, { state: 'success', successLabel: 'Saved' }), />Saved<\/button>/);
  assert.match(render(ui.IconAction, { label: 'Remove contact', icon: '×' }), /aria-label="Remove contact"/);
});
test('fields/selects connect labels, validation and existing descriptions', () => {
  const field = render(ui.Field, { id: 'contact', label: 'Contact', error: 'Required', 'aria-describedby': 'external', wrapperClassName: 'w-full' });
  assert.match(field, /for="contact"/); assert.match(field, /aria-invalid="true"/);
  assert.match(field, /aria-describedby="external contact-message"/);
  assert.match(field, /id="contact-message"/); assert.match(field, /ov-field-group w-full/);
  const select = render(ui.Select, { label: 'Status', defaultValue: 'active', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }] });
  assert.match(select, /value="active" selected=""/);
});
test('native state semantics are exported for selection and navigation', () => {
  assert.match(render(ui.FilterChip, { selected: true }, 'Active'), /aria-pressed="true"/);
  assert.match(render(ui.Checkbox, { label: 'Contact', mixed: true }), /aria-checked="mixed"/);
  assert.match(render(ui.Switch, { label: 'Sync', defaultChecked: true }), /role="switch"/);
  assert.match(render(ui.NavigationItem, { href: '/contacts', current: true }, 'Contacts'), /aria-current="page"/);
  const disabled = render(ui.NavigationItem, { href: '/contacts', disabled: true }, 'Contacts');
  assert.doesNotMatch(disabled, /href=/); assert.match(disabled, /aria-disabled="true"/);
  const segmented = render(ui.SegmentedControl, { label: 'View', defaultValue: 'a', options: [{ value: 'a', label: 'Contacts' }, { value: 'b', label: 'Companies' }] });
  assert.match(segmented, /<legend[^>]*>View<\/legend>/);
  assert.equal((segmented.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((segmented.match(/checked=""/g) ?? []).length, 1);
});
test('download actions cannot navigate when unavailable or preparing', () => {
  for (const props of [{ unavailable: true }, { state: 'loading' }]) {
    const html = render(ui.DownloadAction, { href: '/app.zip', label: 'Download', ...props });
    assert.doesNotMatch(html, /href=/); assert.match(html, /aria-disabled="true"/);
  }
  assert.match(render(ui.DownloadAction, { href: '/app.zip', label: 'Download', download: true }), /download=""/);
});
test('remaining compositions use semantic elements and public material props', () => {
  const specimens = [
    [ui.SectionLabel, { tone: 'success' }, 'Ready'],
    [ui.StatusMessage, { title: 'Saved', tone: 'success' }, 'Contact saved'],
    [ui.FAQRow, { question: 'How?', answer: 'Like this', open: true }],
    [ui.FeatureCard, { title: 'Contacts' }, 'Organized'],
    [ui.DownloadCard, { platform: 'macOS', action: h(ui.DownloadAction, { label: 'Download', href: '/mac.zip' }) }],
    [ui.SiteNavigationDesktop, { brand: 'Ovelle', links: [{ href: '/', label: 'Home', current: true }] }],
    [ui.SiteNavigationMobile, { brand: 'Ovelle', links: [{ href: '/', label: 'Home' }] }],
    [ui.ConfirmationDialog, { open: false, title: 'Archive?', onConfirm() {}, onOpenChange() {} }, 'Archive contact'],
  ];
  for (const [component, props, children] of specimens) {
    const html = render(component, { ...props, material: 'liquid-glass', glassFrost: 37.5 }, children);
    assert.match(html, /data-material="liquid-glass"/);
    assert.match(html, /--ov-panel-blur:15px/);
  }
  assert.match(render(ui.FAQRow, { question: 'How?', answer: 'Like this' }), /<details.*<summary/);
  assert.match(render(ui.StatusMessage, { title: 'Failed', tone: 'error' }, 'Retry'), /role="alert"/);
});
