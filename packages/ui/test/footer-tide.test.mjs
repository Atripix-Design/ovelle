import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountFooterTide } from '../dist/footer-tide.js';

function browser(t) {
  let nextFrame = 0;
  let paints = [];
  let visibility;
  let visibilityListener;
  const frames = new Map();
  const ink = { fillText() {} };
  const context = { clearRect() { paints = []; }, setTransform() {}, drawImage(...args) { paints.push(args.slice(1)); } };
  const page = { hidden: false,
    createElement: () => ({ getContext: () => ink }),
    addEventListener(_type, listener) { visibilityListener = listener; },
    removeEventListener(_type, listener) { assert.equal(listener, visibilityListener); visibilityListener = null; },
  };
  const globals = {
    document: page, window: { devicePixelRatio: 1 },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class {
      constructor(listener) { visibility = value => listener([{ isIntersecting: value }]); }
      observe() {}
      disconnect() { visibility = null; }
    },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(frame) { frames.delete(frame); },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  t.mock.method(Math, 'random', () => .5);
  return {
    frames,
    get paints() { return paints; },
    canvas: { clientWidth: 980, clientHeight: 560, getContext: () => context, getBoundingClientRect: () => ({ left: 5, top: 10 }) },
    reveal(visible) { visibility(visible); },
    hideTab(hidden) { page.hidden = hidden; visibilityListener(); },
    step(now) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(now);
    },
  };
}

test('draws a still field and releases its work when stopped or not visible', t => {
  const page = browser(t);
  const tide = mountFooterTide(page.canvas, { motion: false, dark: false });
  assert.ok(page.paints.length > 1000);
  const initial = page.paints;
  page.reveal(true);
  assert.equal(page.frames.size, 0);
  assert.equal(page.paints, initial);
  tide.setMotion(true);
  page.step(100);
  page.step(120);
  assert.notDeepEqual(page.paints, initial);
  const moving = page.paints;
  tide.setMotion(false);
  assert.equal(page.paints, moving, 'pausing freezes the already presented frame');
  assert.equal(page.frames.size, 0);
  tide.setMotion(true);
  page.hideTab(true);
  assert.equal(page.frames.size, 0);
  page.hideTab(false);
  assert.equal(page.frames.size, 1);
  page.reveal(false);
  assert.equal(page.frames.size, 0);
  tide.dispose();
});

test('a wake changes a local neighborhood without displacing distant wave samples', t => {
  const page = browser(t);
  function sample(interact) {
    const tide = mountFooterTide(page.canvas, { motion: true, dark: false });
    page.reveal(true);
    page.step(0);
    page.step(16);
    if (interact) tide.ripple(495, 415, 46);
    page.step(32);
    page.step(48);
    const result = page.paints;
    tide.dispose();
    return result;
  }
  const ambient = sample(false);
  const interactive = sample(true);
  assert.equal(ambient.length, interactive.length);
  assert.ok(ambient.some((point, index) => Math.abs(point[5] - interactive[index][5]) > 10));
  assert.ok(ambient.filter(point => point[4] < 180).length > 100);
  ambient.forEach((point, index) => {
    if (point[4] < 180 || point[4] > 790) assert.deepEqual(point, interactive[index]);
  });
});
