/** The tide is a projected water surface, sampled in depth order. Time is in seconds. */
type Ripple = { x: number; y: number; bornAt: number; strength: number };
type Point = { x: number; y: number; depth: number; phase: number; grain: number };
const characters = ['.', ':', '·', '~', '+'] as const;
const shades = [
  ['#8db8cd', '#5e97b3', '#2c7398'],
  ['#406680', '#628da8', '#85bed9'],
] as const;

function points(width: number, height: number, seed: number): Point[] {
  const rows = width < 640 ? 25 : 33;
  const cols = Math.min(190, Math.max(48, Math.round(width / 9)));
  const result: Point[] = [];
  const depthHeight = height * (width < 640 ? .31 : .44);
  for (let row = 0; row < rows; row++) {
    const depth = row / (rows - 1);
    const spread = .79 + depth * .39;
    for (let col = 0; col <= cols; col++) {
      const grain = (Math.sin((col + seed) * 12.9898 + row * 78.233) * 43758.5453) % 1;
      result.push({
        x: width * (.5 + (col / cols - .5) * spread) + grain * 1.2,
        y: height - 62 - (1 - depth ** 1.53) * depthHeight,
        depth,
        phase: col / cols,
        grain: Math.abs(grain),
      });
    }
  }
  return result;
}

// A short damped packet travels away from its source. The envelope keeps wakes local
// and stops them from fighting each other after a quick run across the footer.
function wakeAt(x: number, y: number, time: number, ripples: readonly Ripple[]) {
  let displacement = 0;
  for (const ripple of ripples) {
    const age = time - ripple.bornAt;
    const distance = Math.hypot((x - ripple.x) * .87, y - ripple.y);
    const front = distance - age * 245;
    if (Math.abs(front) > 100) continue;
    displacement += ripple.strength * Math.cos(front / 15) *
      (1 - Math.abs(front) / 100) ** 2 * Math.exp(-age * 1.16);
  }
  return displacement;
}

function glyphAtlas(dark: boolean) {
  const atlas = document.createElement('canvas');
  atlas.width = characters.length * 28;
  atlas.height = shades[0].length * 28;
  const ink = atlas.getContext('2d')!;
  ink.font = '20px ui-monospace, monospace';
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  shades[Number(dark)].forEach((color, row) => {
    ink.fillStyle = color;
    characters.forEach((character, col) => ink.fillText(character, col * 28 + 14, row * 28 + 14));
  });
  return atlas;
}

export function mountFooterTide(canvas: HTMLCanvasElement, { motion, dark }: { motion: boolean; dark: boolean }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ripple() {}, setMotion() {}, dispose() {} };
  const ink = ctx;
  const atlas = glyphAtlas(dark);
  const seed = 1 + Math.random() * 7;
  let width = 0, height = 0, frame = 0, clock = 0, previous = 0;
  let surface: Point[] = [];
  let ripples: Ripple[] = [];
  let visible = false;

  function draw(time: number) {
    if (!width || !height) return;
    ink.clearRect(0, 0, width, height);
    const swell = Math.min(height * .11, width * .09);
    const drift = time * .72;
    const back = 1.4 * Math.sin(time * .19 + seed);
    ripples = ripples.filter(ripple => time - ripple.bornAt < 2.7);
    for (const point of surface) {
      const { x, y, phase, depth, grain } = point;
      const a = phase * 9.1 + depth * 6.9 - drift + back * .31;
      const b = phase * 15.5 - depth * 7.8 + drift * .71 + seed * .22;
      const crest = .66 * Math.sin(a) + .23 * Math.sin(b) + .11 * Math.sin(a * 1.6 + b * .44);
      const shoulder = .48 + .52 * Math.sin(Math.PI * depth);
      const wake = ripples.length ? wakeAt(x, y - crest * swell * shoulder, time, ripples) : 0;
      const lift = crest * swell * shoulder + wake;
      const slope = Math.cos(a) * .69 + Math.cos(b) * .31;
      const foam = crest + Math.abs(wake) / 32 + grain * .24;
      const shade = foam > .64 ? 2 : slope > -.06 ? 1 : 0;
      const glyph = foam > .68 ? 3 : foam > .49 && grain > .9 ? 4 : slope > .25 ? 1 : grain > .53 ? 2 : 0;
      const size = 8 + depth * 9 + (glyph === 3 ? 2 : 0);
      ink.drawImage(atlas, glyph * 28, shade * 28, 28, 28, x - size / 2, y - lift - size / 2, size, size);
    }
  }

  function measure() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const density = Math.min(window.devicePixelRatio || 1, 1.65);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ink.setTransform(density, 0, 0, density, 0, 0);
    surface = points(width, height, seed);
    draw(clock);
  }

  function tick(now: number) {
    frame = 0;
    if (previous) clock += Math.min((now - previous) / 1000, .04);
    previous = now;
    draw(clock);
    reconcile();
  }

  function reconcile() {
    if (motion && visible && !document.hidden) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = previous = 0;
    }
  }

  const resize = new ResizeObserver(measure);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    reconcile();
  });
  resize.observe(canvas);
  intersection.observe(canvas);
  document.addEventListener('visibilitychange', reconcile);
  measure();

  return {
    ripple(clientX: number, clientY: number, strength: number) {
      if (!motion || !visible || document.hidden) return;
      const bounds = canvas.getBoundingClientRect();
      ripples = [...ripples.slice(-5), {
        x: clientX - bounds.left, y: clientY - bounds.top, bornAt: clock, strength,
      }];
    },
    setMotion(enabled: boolean) {
      motion = enabled;
      if (!enabled) ripples = [];
      reconcile();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
    },
  };
}
