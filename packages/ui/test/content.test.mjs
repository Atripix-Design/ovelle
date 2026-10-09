import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatePicker, Pagination, EmptyState, Skeleton, SkeletonRegion, Button } from '../dist/index.js';
import { parseCalendarDate, calendarDate } from '../dist/date-picker.js';
import { paginationItems } from '../dist/pagination.js';
const render = (c, p, children) => renderToStaticMarkup(h(c, p, children));

test('calendar dates reject rollover and preserve leap days and local year', () => {
  for (const value of ['2026-02-29', '2026-13-01', '2026-04-31', '10/08/2026', 'invalid']) assert.equal(parseCalendarDate(value), undefined);
  for (const value of ['2024-02-29', '2026-10-08', '0099-01-01']) assert.equal(calendarDate(parseCalendarDate(value)), value);
});
test('pagination handles gaps, both boundaries, invalid counts, and very large collections', () => {
  assert.deepEqual(paginationItems(1, 8), [1, 2, 'gap', 8]);
  assert.deepEqual(paginationItems(4, 8), [1, 2, 3, 4, 5, 'gap', 8]);
  assert.deepEqual(paginationItems(8, 8), [1, 'gap', 7, 8]);
  assert.deepEqual(paginationItems(Infinity, NaN), [1]);
  assert.ok(paginationItems(500000, 1000000).length <= 7);
  const html = render(Pagination, { page: 1, pageCount: 8, onPageChange() {} });
  assert.match(html, /aria-label="Previous page"[^>]*disabled/);
  assert.match(html, /aria-current="page"/);
});
test('date trigger associates label, validation, form value and disabled state', () => {
  const html = render(DatePicker, { label: 'Date', name: 'date', defaultValue: '2026-10-08', disabled: true, error: 'Date unavailable' });
  assert.match(html, /name="date" value="2026-10-08"/);
  assert.match(html, /aria-invalid="true"/); assert.match(html, /aria-describedby=/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /disabled/);
});
test('empty states accept contextual content and existing action components', () => {
  const html = render(EmptyState, { title: 'No matches', align: 'start', size: 'compact', action: h(Button, {}, 'Clear filters'), contentClassName: 'content-slot', actionClassName: 'action-slot' }, 'Try another search.');
  assert.match(html, /aria-labelledby=/); assert.match(html, /data-align="start"/);
  assert.match(html, /content-slot/); assert.match(html, /action-slot/);
  assert.match(html, />Clear filters<\/span>/);
});
test('skeleton source content is inert and hidden with one accessible region status', () => {
  const html = render(SkeletonRegion, { label: 'Loading downloads…' }, h(Skeleton, { animated: false }, h(Button, {}, 'Download')));
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  assert.match(html, /aria-busy="true"/); assert.match(html, /aria-hidden="true" inert=""/);
  assert.match(html, /data-animated="false"/);
});
