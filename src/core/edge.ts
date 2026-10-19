// The torn edge. One tear line is shared by both halves so they fit back
// together: where the main part keeps a fibre, the stub has the matching bite.
// Each perforation hole leaves a half-circle scallop on both sides.

export const HOLE_PITCH = 7;
export const HOLE_RADIUS = 1.6;
const STEP = 0.5;
const SEAM_OVERLAP = 0.6; // hides the anti-aliased hairline where fill meets fill

export interface TearLine {
  ys: number[];
  /** Offset of the main part's edge from the seam. Negative bites in, positive sticks out. */
  main: number[];
  /** Offset of the stub's edge from the seam. Positive bites in, negative sticks out. */
  stub: number[];
  holes: number[];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function holePositions(top: number, bottom: number): number[] {
  const length = bottom - top;
  const count = Math.max(1, Math.floor(length / HOLE_PITCH));
  const pitch = length / count;
  return Array.from({ length: count }, (_, i) => top + (i + 0.5) * pitch);
}

export function makeTearLine(top: number, bottom: number): TearLine {
  const holes = holePositions(top, bottom);
  const n = Math.max(2, Math.round((bottom - top) / STEP) + 1);
  const ys = Array.from({ length: n }, (_, i) => top + ((bottom - top) * i) / (n - 1));

  // Jagged base: random knots joined by straight segments, like torn fibre.
  const knotGap = 1.5;
  const knots = Array.from({ length: Math.ceil((bottom - top) / knotGap) + 2 }, () => (Math.random() * 2 - 1) * 0.55);
  // Tufts: short sharp spikes of fibre, random side, random size.
  const tufts = Array.from({ length: Math.round((bottom - top) / 5) }, () => ({
    y: top + Math.random() * (bottom - top),
    half: 0.6 + Math.random() * 1.4,
    h: (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.8),
  }));

  const main: number[] = [];
  const stub: number[] = [];
  for (const y of ys) {
    const k = (y - top) / knotGap;
    const i = Math.floor(k);
    let d = knots[i] + (knots[i + 1] - knots[i]) * (k - i);
    for (const t of tufts) {
      const u = Math.abs(y - t.y) / t.half;
      if (u < 1) d += t.h * (1 - u);
    }
    d = Math.max(-2.6, Math.min(2.6, d));
    // Settle into the notches at either end.
    d *= smooth(top, top + 1.5, y) * smooth(bottom, bottom - 1.5, y);

    let near = Infinity;
    for (const h of holes) near = Math.min(near, Math.abs(y - h));
    d *= smooth(HOLE_RADIUS, HOLE_RADIUS + 1.2, near);
    const bite = near < HOLE_RADIUS ? Math.sqrt(HOLE_RADIUS * HOLE_RADIUS - near * near) : 0;
    main.push(Math.min(d, -bite));
    stub.push(Math.max(d, bite));
  }
  return { ys, main, stub, holes };
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Mask for the main part: its box, notches, and bites along torn stretches. */
export function mainMask(width: number, height: number, notch: number, line: TearLine, torn: (y: number) => boolean) {
  const x0 = width;
  let d = `M0 0H${f(x0 - notch)}A${notch} ${notch} 0 0 0 ${f(x0)} ${f(notch)}`;
  line.ys.forEach((y, i) => {
    d += `L${f(x0 + (torn(y) ? Math.min(line.main[i], 0) : 0))} ${f(y)}`;
  });
  d += `L${f(x0)} ${f(height - notch)}A${notch} ${notch} 0 0 0 ${f(x0 - notch)} ${f(height)}H0Z`;
  return toMask(width, height, d);
}

/** Mask for the stub, in the stub's own box (x = 0 is the seam). */
export function stubMask(width: number, height: number, notch: number, line: TearLine, torn: (y: number) => boolean) {
  let d = `M${f(notch)} 0H${f(width)}V${f(height)}H${f(notch)}A${notch} ${notch} 0 0 0 0 ${f(height - notch)}`;
  for (let i = line.ys.length - 1; i >= 0; i--) {
    const y = line.ys[i];
    d += `L${f(torn(y) ? Math.max(line.stub[i], 0) : 0)} ${f(y)}`;
  }
  d += `L0 ${f(notch)}A${notch} ${notch} 0 0 0 ${f(notch)} 0Z`;
  return toMask(width, height, d);
}

/**
 * Fibres that stick out past a box edge can't be drawn by the element itself,
 * so they are filled in by the overlay. `side` is 1 for the main part
 * (sticking out to the right of `x0`) and -1 for the stub (to the left).
 */
export function fringePath(x0: number, line: TearLine, torn: (y: number) => boolean, side: 1 | -1) {
  const values = side === 1 ? line.main : line.stub;
  let d = "";
  let run: number[] = [];
  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const first = line.ys[run[0]];
    const last = line.ys[run[run.length - 1]];
    d += `M${f(x0 - side * SEAM_OVERLAP)} ${f(first)}`;
    for (const i of run) {
      const out = side === 1 ? Math.max(values[i], 0) : Math.min(values[i], 0);
      d += `L${f(x0 + out)} ${f(line.ys[i])}`;
    }
    d += `L${f(x0 - side * SEAM_OVERLAP)} ${f(last)}Z`;
    run = [];
  };
  line.ys.forEach((y, i) => {
    if (torn(y)) run.push(i);
    else flush();
  });
  flush();
  return d;
}

function toMask(width: number, height: number, d: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${f(width)} ${f(height)}' preserveAspectRatio='none'><path d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`;
}
