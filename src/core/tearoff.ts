import { fringePath, HOLE_RADIUS, mainMask, makeTearLine, stubMask, type TearLine } from "./edge";

export interface TearOffOptions {
  /** 0–100. How far the joints stretch before they give, and how much they wobble. */
  jelly?: number;
  /** Number of joints along the perforation, 2–16. */
  joints?: number;
  /** Bring the stub back this many ms after it is gone. `false` keeps it gone. */
  autoReset?: number | false;
  onJointBreak?: (index: number, remaining: number) => void;
  onDetach?: () => void;
  onTorn?: () => void;
  onReset?: () => void;
}

export interface TearOff {
  update(options: TearOffOptions): void;
  /** Tear the stub off without a pointer (keyboard, buttons, demos). */
  tear(): void;
  reset(): void;
  destroy(): void;
}

type Vec = { x: number; y: number };
type Mode = "attached" | "free" | "gone";

interface Joint {
  y: number;
  strength: number;
  broken: boolean;
  path: SVGPathElement;
}

interface Fiber {
  onStub: boolean;
  origin: Vec; // world for main, body-local for stub
  dir: Vec; // same space as origin
  len: number;
  vel: number;
  rest: number;
  path: SVGPathElement;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const DT = 1 / 480;
const BREAK_GAP = 0.024; // seconds between two joints giving way
const FADE_DELAY = 0.2; // let the flutter read before it fades
const FADE = 0.7;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rot = (p: Vec, a: number): Vec => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
const f1 = (n: number) => Math.round(n * 10) / 10;

export function createTearOff(root: HTMLElement, options: TearOffOptions = {}): TearOff {
  const main = root.querySelector<HTMLElement>(".tot-main");
  const stub = root.querySelector<HTMLElement>(".tot-stub");
  if (!main || !stub) throw new Error("tear-off-ticket: root needs a .tot-main and a .tot-stub");

  let opts: Required<Omit<TearOffOptions, "onJointBreak" | "onDetach" | "onTorn" | "onReset">> &
    TearOffOptions = { jelly: 50, joints: 7, autoReset: false, ...options };

  const reduceMotion =
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tot-tissue");
  svg.setAttribute("aria-hidden", "true");
  const mainLayer = document.createElementNS(SVG_NS, "g");
  const mainFringe = document.createElementNS(SVG_NS, "path");
  mainFringe.setAttribute("class", "tot-fringe");
  const dotLayer = document.createElementNS(SVG_NS, "g");
  mainLayer.append(mainFringe, dotLayer);
  const bridgeLayer = document.createElementNS(SVG_NS, "g");
  const fiberLayer = document.createElementNS(SVG_NS, "g");
  svg.append(mainLayer, bridgeLayer, fiberLayer);
  root.appendChild(svg);

  // The stub rides in a carrier so it can lift and cast its own shadow
  // (the stub itself is masked, which would clip a shadow).
  const ownCarrier = !stub.parentElement?.classList.contains("tot-lift");
  const carrier = ownCarrier ? document.createElement("div") : stub.parentElement!;
  if (ownCarrier) {
    carrier.className = "tot-lift";
    stub.before(carrier);
    carrier.appendChild(stub);
  }
  const stubSvg = document.createElementNS(SVG_NS, "svg");
  stubSvg.setAttribute("class", "tot-tissue");
  stubSvg.setAttribute("aria-hidden", "true");
  const stubFringe = document.createElementNS(SVG_NS, "path");
  stubFringe.setAttribute("class", "tot-fringe");
  stubSvg.appendChild(stubFringe);
  carrier.appendChild(stubSvg);

  if (!stub.hasAttribute("tabindex")) stub.tabIndex = 0;
  if (!stub.hasAttribute("role")) stub.setAttribute("role", "button");
  if (!stub.hasAttribute("aria-label")) stub.setAttribute("aria-label", "Tear off the stub");

  // Geometry, measured from layout at rest.
  let seamX = 0;
  let H = 0;
  let w = 0;
  let inertia = 1;
  let rest: Vec = { x: 0, y: 0 };
  let notch = 0;

  // Rigid body of the stub (centre of mass + angle).
  let c: Vec = { x: 0, y: 0 };
  let v: Vec = { x: 0, y: 0 };
  let angle = 0;
  let omega = 0;
  let opacity = 1;
  let mode: Mode = "attached";

  // The main part slides a little on the table when pulled, then springs back.
  let mo: Vec = { x: 0, y: 0 };
  let mv: Vec = { x: 0, y: 0 };
  // How far the stub has lifted off the table, 0–1, and the flutter phase in flight.
  let lift = 0;
  let liftV = 0;
  let flutter = 0;

  let joints: Joint[] = [];
  let fibers: Fiber[] = [];
  let line: TearLine = { ys: [], main: [], stub: [], holes: [] };
  let dots: { y: number; el: SVGCircleElement }[] = [];
  let front: number | null = null;
  let frontStep = 1;
  let lastBreak = -1;
  let clock = 0;
  let fadeT = 0;

  let pointer: Vec | null = null;
  let grab: Vec = { x: 0, y: 0 };
  let pointerId: number | null = null;
  let scripted: { t: number; from: Vec; by: Vec; dur: number } | null = null;

  let raf = 0;
  let last = 0;
  let resetTimer = 0;

  // jelly → physical parameters
  const breakLen = () => 5 + opts.jelly * 0.25;
  const zeta = () => 0.95 - opts.jelly * 0.0065;
  const fiberZeta = () => 0.55 - opts.jelly * 0.004;
  const bridgeWidth = () => {
    const span = (H - 2 * notch) / joints.length;
    return Math.max(3, span * 0.58);
  };

  function measure() {
    seamX = main!.offsetWidth;
    H = root.offsetHeight;
    w = stub!.offsetWidth;
    notch = parseFloat(getComputedStyle(root).getPropertyValue("--tot-notch")) || 0;
    inertia = (w * w + H * H) / 12;
    rest = { x: seamX + w / 2, y: H / 2 };
  }

  function buildJoints() {
    for (const j of joints) j.path.remove();
    for (const f of fibers) f.path.remove();
    fibers = [];
    const n = clamp(Math.round(opts.joints), 2, 16);
    const span = (H - 2 * notch) / n;
    joints = Array.from({ length: n }, (_, i) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", "tot-bridge");
      bridgeLayer.appendChild(path);
      return { y: notch + (i + 0.5) * span, strength: 0.85 + Math.random() * 0.3, broken: false, path };
    });
    front = null;
    lastBreak = -1;
    buildEdge();
  }

  // A fresh tear line every time, so no two tears look alike.
  function buildEdge() {
    line = makeTearLine(notch, H - notch);
    dotLayer.replaceChildren();
    dots = line.holes.map((y) => {
      const el = document.createElementNS(SVG_NS, "circle");
      el.setAttribute("class", "tot-hole");
      el.setAttribute("cx", String(seamX));
      el.setAttribute("cy", f1(y).toString());
      el.setAttribute("r", String(HOLE_RADIUS));
      dotLayer.appendChild(el);
      return { y, el };
    });
    updateEdge();
  }

  function torn(y: number): boolean {
    const span = (H - 2 * notch) / joints.length;
    const i = clamp(Math.floor((y - notch) / span), 0, joints.length - 1);
    return joints[i]?.broken ?? false;
  }

  function updateEdge() {
    const m = mainMask(seamX, H, notch, line, torn);
    const s = stubMask(w, H, notch, line, torn);
    main!.style.setProperty("-webkit-mask", m);
    main!.style.setProperty("mask", m);
    stub!.style.setProperty("-webkit-mask", s);
    stub!.style.setProperty("mask", s);
    mainFringe.setAttribute("d", fringePath(seamX, line, torn, 1));
    stubFringe.setAttribute("d", fringePath(0, line, torn, -1));
    for (const d of dots) d.el.style.display = torn(d.y) ? "none" : "";
  }

  function toWorld(local: Vec): Vec {
    const r = rot(local, angle);
    return { x: c.x + r.x, y: c.y + r.y };
  }
  function velocityAt(world: Vec): Vec {
    const rx = world.x - c.x;
    const ry = world.y - c.y;
    return { x: v.x - omega * ry, y: v.y + omega * rx };
  }
  const jointLocal = (j: Joint): Vec => ({ x: -w / 2, y: j.y - H / 2 });

  function setRest() {
    c = { ...rest };
    v = { x: 0, y: 0 };
    angle = 0;
    omega = 0;
    mo = { x: 0, y: 0 };
    mv = { x: 0, y: 0 };
    lift = 0;
    liftV = 0;
  }

  // ── physics ────────────────────────────────────────────────────────────

  function step(dt: number) {
    clock += dt;
    let fx = 0;
    let fy = 0;
    let torque = 0;
    const apply = (at: Vec, Fx: number, Fy: number) => {
      fx += Fx;
      fy += Fy;
      torque += (at.x - c.x) * Fy - (at.y - c.y) * Fx;
    };

    const target = scripted ? scriptedPointer() : pointer;
    const z = zeta();

    if (target && mode !== "gone") {
      const g = toWorld(grab);
      const gv = velocityAt(g);
      const k = mode === "attached" ? 900 : 500;
      const cd = 2 * Math.sqrt(k) * 0.7;
      let dx = target.x - g.x;
      let dy = target.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 320) {
        dx *= 320 / d;
        dy *= 320 / d;
      }
      apply(g, k * dx - cd * gv.x, k * dy - cd * gv.y);
    }

    // Whatever the joints pull on the stub, they pull back on the main part.
    let rx = 0;
    let ry = 0;
    const seam = seamX + mo.x;

    if (mode === "attached") {
      const intact = joints.filter((j) => !j.broken).length;
      const kN = 2200 / joints.length;
      const kS = kN * 3;
      const cd = 2 * Math.sqrt(kN) * z;
      for (const j of joints) {
        if (j.broken) continue;
        const b = toWorld(jointLocal(j));
        const bv = velocityAt(b);
        const Fx = kN * (seam - b.x) - cd * (bv.x - mv.x);
        const Fy = kS * (j.y + mo.y - b.y) - cd * 1.7 * (bv.y - mv.y);
        apply(b, Fx, Fy);
        rx -= Fx;
        ry -= Fy;
      }

      // The stub cannot push into the main part: that is what makes it pivot.
      const kC = 7000;
      for (const yy of [-H / 2 + notch, 0, H / 2 - notch]) {
        const p = toWorld({ x: -w / 2, y: yy });
        if (p.x < seam && p.y > mo.y && p.y < H + mo.y) {
          const pv = velocityAt(p);
          const Fx = kC * (seam - p.x) - 2 * Math.sqrt(kC) * 0.6 * (pv.x - mv.x);
          apply(p, Fx, 0);
          rx -= Fx;
        }
      }

      // Paper stiffness pulling home: light while held, firm when let go.
      const held = !!target;
      const kR = held ? 30 : 260 + (intact / joints.length) * 200;
      const cR = 2 * Math.sqrt(kR) * (held ? 1 : z);
      fx += kR * (rest.x + mo.x - c.x) - cR * v.x;
      fy += kR * (rest.y + mo.y - c.y) - cR * v.y;
      torque += (-kR * angle - cR * omega) * inertia;
    } else if (mode === "free" && !target) {
      // Paper falls like paper: light gravity, lots of air, and a flutter
      // that swings it side to side and rocks it as it goes.
      flutter += dt * 7;
      fy += 1500;
      fx += 420 * Math.sin(flutter);
      omega += (2.6 * Math.cos(flutter) - omega) * 4 * dt;
      fadeT += dt;
      const t = clamp((fadeT - FADE_DELAY) / FADE, 0, 1);
      opacity = 1 - t * t;
    }

    const lin = mode === "free" && !target ? 2.2 : 2;
    v.x += (fx - lin * v.x) * dt;
    v.y += (fy - lin * v.y) * dt;
    omega += (torque / inertia - lin * omega) * dt;
    c.x += v.x * dt;
    c.y += v.y * dt;
    angle += omega * dt;

    // The main part: heavier, held by the table, wobbles back when a joint lets go.
    const M = 3;
    const kM = 6000;
    const cM = 2 * Math.sqrt(kM * M) * 0.35;
    mv.x += ((rx - kM * mo.x - cM * mv.x) / M) * dt;
    mv.y += ((ry - kM * mo.y - cM * mv.y) / M) * dt;
    mo.x += mv.x * dt;
    mo.y += mv.y * dt;

    // Lift: a little while still attached, fully once free.
    const broken = joints.length - joints.filter((j) => !j.broken).length;
    const liftTarget = mode === "free" ? 1 : target ? 0.2 + 0.45 * (broken / joints.length) : 0;
    liftV += (220 * (liftTarget - lift) - 2 * Math.sqrt(220) * 0.8 * liftV) * dt;
    lift += liftV * dt;

    if (mode === "attached") breakJoints();
    stepFibers(dt);

    if (mode === "free" && opacity <= 0) {
      mode = "gone";
      pointer = null;
      scripted = null;
      opts.onTorn?.();
      if (opts.autoReset !== false) {
        resetTimer = window.setTimeout(() => reset(), opts.autoReset);
      }
    }
  }

  function breakJoints() {
    if (clock - lastBreak < BREAK_GAP && lastBreak >= 0) return;
    const limit = breakLen();
    const stretch = (j: Joint) => {
      const b = toWorld(jointLocal(j));
      return Math.hypot(b.x - seamX - mo.x, b.y - j.y - mo.y) / (limit * j.strength);
    };

    let idx: number | null = null;
    if (front === null) {
      const top = stretch(joints[0]);
      const bottom = stretch(joints[joints.length - 1]);
      if (top >= 1 || bottom >= 1) idx = top >= bottom ? 0 : joints.length - 1;
      if (idx !== null) frontStep = idx === 0 ? 1 : -1;
    } else if (stretch(joints[front]) >= 1) {
      idx = front;
    }
    if (idx === null) return;

    const j = joints[idx];
    j.broken = true;
    lastBreak = clock;
    spawnFibers(j);

    const next = idx + frontStep;
    front = next >= 0 && next < joints.length ? next : null;
    const remaining = joints.filter((x) => !x.broken).length;
    opts.onJointBreak?.(idx, remaining);

    if (remaining === 0) {
      mode = "free";
      fadeT = 0;
      flutter = Math.random() * Math.PI * 2;
      opts.onDetach?.();
    }
  }

  function spawnFibers(j: Joint) {
    const a = { x: seamX + mo.x, y: j.y + mo.y };
    const b = toWorld(jointLocal(j));
    const gap = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / gap, y: (b.y - a.y) / gap };
    const make = (onStub: boolean, origin: Vec, d: Vec): Fiber => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", "tot-fiber");
      fiberLayer.appendChild(path);
      return { onStub, origin, dir: d, len: gap / 2, vel: 0, rest: 0, path };
    };
    fibers.push(make(false, { x: seamX, y: j.y }, dir));
    fibers.push(make(true, jointLocal(j), rot({ x: -dir.x, y: -dir.y }, -angle)));
    j.path.setAttribute("d", "");
    updateEdge();
  }

  function stepFibers(dt: number) {
    const k = 1400;
    const cd = 2 * Math.sqrt(k) * fiberZeta();
    for (const f of fibers) {
      f.vel += (k * (f.rest - f.len) - cd * f.vel) * dt;
      f.len = Math.max(0, f.len + f.vel * dt);
    }
  }

  function scriptedPointer(): Vec {
    const s = scripted!;
    const t = clamp((clock - s.t) / s.dur, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (t >= 1 && mode === "free") scripted = null;
    return { x: s.from.x + s.by.x * e, y: s.from.y + s.by.y * e };
  }

  // ── rendering ──────────────────────────────────────────────────────────

  function render() {
    const dx = c.x - rest.x;
    const dy = c.y - rest.y;
    const l = Math.max(0, lift);
    // The grabbed side comes up towards you; in flight the flutter rocks it.
    let tiltX = 0;
    let tiltY = 0;
    if (mode === "free" && !pointer && !scripted) {
      tiltX = 22 * Math.sin(flutter) * l;
      tiltY = 14 * Math.cos(flutter * 1.3) * l;
    } else {
      tiltX = -(grab.y / (H / 2)) * 7 * l;
      tiltY = (grab.x / (w / 2)) * 7 * l;
    }
    carrier.style.transform =
      `translate(${f1(dx)}px, ${f1(dy)}px) rotate(${angle.toFixed(4)}rad)` +
      (l > 0.002
        ? ` perspective(700px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${(1 + 0.03 * l).toFixed(4)})`
        : "");
    // Light comes from above the screen, so the shadow offset ignores the stub's rotation.
    if (l > 0.002) {
      const off = rot({ x: 0, y: 2 + 12 * l }, -angle);
      carrier.style.filter = `drop-shadow(${f1(off.x)}px ${f1(off.y)}px ${f1(3 + 16 * l)}px rgb(0 0 0 / ${(0.04 + 0.12 * l).toFixed(3)}))`;
    } else {
      carrier.style.filter = "";
    }
    carrier.style.opacity = opacity < 1 ? opacity.toFixed(3) : "";
    main!.style.transform = Math.abs(mo.x) + Math.abs(mo.y) > 0.01 ? `translate(${f1(mo.x)}px, ${f1(mo.y)}px)` : "";
    mainLayer.setAttribute("transform", `translate(${f1(mo.x)} ${f1(mo.y)})`);
    root.dataset.state = mode;

    const t0 = bridgeWidth();
    const tB = rot({ x: 0, y: 1 }, angle);
    for (const j of joints) {
      if (j.broken) continue;
      const a = { x: seamX + mo.x, y: j.y + mo.y };
      const b = toWorld(jointLocal(j));
      j.path.setAttribute("d", bridgePath(a, b, { x: 0, y: 1 }, tB, t0));
    }
    for (const f of fibers) {
      const origin = f.onStub ? toWorld(f.origin) : { x: f.origin.x + mo.x, y: f.origin.y + mo.y };
      const dir = f.onStub ? rot(f.dir, angle) : f.dir;
      f.path.setAttribute("d", fiberPath(origin, dir, f.len, t0));
      f.path.style.opacity = f.onStub && opacity < 1 ? opacity.toFixed(3) : "";
    }
  }

  // A jelly bar: full width where it meets the paper, necking as it stretches.
  function bridgePath(a: Vec, b: Vec, tA: Vec, tB: Vec, t0: number): string {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.4) return "";
    const s = t0 * 0.5;
    const neck = t0 * Math.pow(s / (s + L), 0.8);
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const h = t0 / 2;
    const a1 = { x: a.x - tA.x * h, y: a.y - tA.y * h };
    const a2 = { x: a.x + tA.x * h, y: a.y + tA.y * h };
    const b1 = { x: b.x - tB.x * h, y: b.y - tB.y * h };
    const b2 = { x: b.x + tB.x * h, y: b.y + tB.y * h };
    const sg = (a1.x - m.x) * n.x + (a1.y - m.y) * n.y > 0 ? 1 : -1;
    const n1 = { x: m.x + n.x * (neck / 2) * sg, y: m.y + n.y * (neck / 2) * sg };
    const n2 = { x: m.x - n.x * (neck / 2) * sg, y: m.y - n.y * (neck / 2) * sg };
    const q1 = { x: 2 * n1.x - (a1.x + b1.x) / 2, y: 2 * n1.y - (a1.y + b1.y) / 2 };
    const q2 = { x: 2 * n2.x - (a2.x + b2.x) / 2, y: 2 * n2.y - (a2.y + b2.y) / 2 };
    return (
      `M${f1(a1.x)} ${f1(a1.y)}Q${f1(q1.x)} ${f1(q1.y)} ${f1(b1.x)} ${f1(b1.y)}` +
      `L${f1(b2.x)} ${f1(b2.y)}Q${f1(q2.x)} ${f1(q2.y)} ${f1(a2.x)} ${f1(a2.y)}Z`
    );
  }

  // A snapped half: a jelly tongue that springs back into the torn edge.
  function fiberPath(o: Vec, d: Vec, len: number, t0: number): string {
    if (len < 0.4) return "";
    const wd = t0 * 0.7 * clamp(Math.sqrt((t0 * 0.6) / Math.max(len, 1)), 0.4, 1);
    const p = { x: -d.y * (wd / 2), y: d.x * (wd / 2) };
    const tip = { x: o.x + d.x * len, y: o.y + d.y * len };
    const k = len * 0.75;
    return (
      `M${f1(o.x + p.x)} ${f1(o.y + p.y)}` +
      `C${f1(o.x + p.x + d.x * k)} ${f1(o.y + p.y + d.y * k)} ${f1(tip.x + p.x)} ${f1(tip.y + p.y)} ${f1(tip.x)} ${f1(tip.y)}` +
      `C${f1(tip.x - p.x)} ${f1(tip.y - p.y)} ${f1(o.x - p.x + d.x * k)} ${f1(o.y - p.y + d.y * k)} ${f1(o.x - p.x)} ${f1(o.y - p.y)}Z`
    );
  }

  // ── loop ───────────────────────────────────────────────────────────────

  function settled(): boolean {
    if (pointer || scripted || mode === "free") return false;
    for (const f of fibers) if (Math.abs(f.len - f.rest) > 0.05 || Math.abs(f.vel) > 0.5) return false;
    const mainStill = Math.hypot(mo.x, mo.y) < 0.1 && Math.hypot(mv.x, mv.y) < 0.5;
    if (mode === "gone") return mainStill;
    return (
      Math.hypot(v.x, v.y) < 0.6 &&
      Math.abs(omega) < 0.003 &&
      Math.hypot(c.x - rest.x, c.y - rest.y) < 0.25 &&
      Math.abs(angle) < 0.001 &&
      mainStill &&
      Math.abs(lift) < 0.01 &&
      Math.abs(liftV) < 0.05
    );
  }

  function frame(now: number) {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    const n = Math.max(1, Math.round(elapsed / DT));
    for (let i = 0; i < n; i++) step(DT);
    if (settled()) {
      if (mode === "attached") setRest();
      mo = { x: 0, y: 0 };
      mv = { x: 0, y: 0 };
      for (const f of fibers) {
        f.len = f.rest;
        f.vel = 0;
      }
      render();
      raf = 0;
      return;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // ── input ──────────────────────────────────────────────────────────────

  function toLocalPoint(e: PointerEvent): Vec {
    const r = root.getBoundingClientRect();
    const scale = r.width / root.offsetWidth || 1;
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function onDown(e: PointerEvent) {
    if (mode === "gone" || scripted || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (reduceMotion?.matches) {
      quietTear();
      return;
    }
    e.preventDefault();
    pointerId = e.pointerId;
    try {
      stub!.setPointerCapture(e.pointerId);
    } catch {
      // The pointer can already be gone (released before this handler ran).
    }
    const p = toLocalPoint(e);
    grab = rot({ x: p.x - c.x, y: p.y - c.y }, -angle);
    pointer = p;
    root.dataset.dragging = "";
    wake();
  }
  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointer = toLocalPoint(e);
  }
  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    pointer = null;
    delete root.dataset.dragging;
    if (mode === "free") fadeT = 0;
    wake();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tear();
    }
  }

  // Reduced motion: no stretching, no flight. The stub just goes.
  function quietTear() {
    if (mode !== "attached") return;
    for (const j of joints) {
      j.broken = true;
      j.path.setAttribute("d", "");
    }
    mode = "gone";
    opacity = 0;
    render();
    opts.onDetach?.();
    opts.onTorn?.();
    if (opts.autoReset !== false) resetTimer = window.setTimeout(() => reset(), opts.autoReset);
  }

  function tear() {
    if (mode !== "attached" || pointer || scripted) return;
    if (reduceMotion?.matches) return quietTear();
    grab = { x: w / 2 - 14, y: -H / 2 + 18 };
    const from = toWorld(grab);
    scripted = { t: clock, from, by: { x: 90, y: 240 }, dur: 0.75 };
    wake();
  }

  function reset() {
    window.clearTimeout(resetTimer);
    pointer = null;
    pointerId = null;
    scripted = null;
    mode = "attached";
    opacity = 1;
    measure();
    buildJoints();
    setRest();
    render();
    stub!.animate?.(
      reduceMotion?.matches
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, scale: "0.95" },
            { opacity: 1, scale: "1" },
          ],
      { duration: reduceMotion?.matches ? 0 : 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
    opts.onReset?.();
  }

  const ro = new ResizeObserver(() => {
    if (mode !== "attached" || pointer || raf) return;
    const before = joints.length;
    measure();
    if (before) {
      const broken = joints.map((j) => j.broken);
      buildJoints();
      joints.forEach((j, i) => (j.broken = broken[i] ?? false));
      updateEdge();
    }
    setRest();
    render();
  });

  measure();
  buildJoints();
  setRest();
  render();
  ro.observe(root);
  stub.addEventListener("pointerdown", onDown);
  stub.addEventListener("pointermove", onMove);
  stub.addEventListener("pointerup", onUp);
  stub.addEventListener("pointercancel", onUp);
  stub.addEventListener("keydown", onKey);

  return {
    update(next) {
      const jointsChanged = next.joints !== undefined && Math.round(next.joints) !== joints.length;
      opts = { ...opts, ...next };
      if (jointsChanged) reset();
    },
    tear,
    reset,
    destroy() {
      cancelAnimationFrame(raf);
      window.clearTimeout(resetTimer);
      ro.disconnect();
      stub.removeEventListener("pointerdown", onDown);
      stub.removeEventListener("pointermove", onMove);
      stub.removeEventListener("pointerup", onUp);
      stub.removeEventListener("pointercancel", onUp);
      stub.removeEventListener("keydown", onKey);
      svg.remove();
      stubSvg.remove();
      if (ownCarrier) {
        carrier.before(stub);
        carrier.remove();
      } else {
        carrier.style.transform = "";
        carrier.style.filter = "";
        carrier.style.opacity = "";
      }
      main.style.transform = "";
      for (const el of [main, stub]) {
        el.style.removeProperty("-webkit-mask");
        el.style.removeProperty("mask");
      }
      delete root.dataset.state;
    },
  };
}
