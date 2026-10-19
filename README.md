# Tear-off Ticket

A ticket whose stub tears off corner to corner, one jelly joint at a time.

**[Try the demo →](https://alexko0421.github.io/tear-off-ticket/)**

Grab the stub and pull. It lifts off the ticket and pivots on the far corner, the perforation stretches, the joints snap in order, and the main part gets tugged along and wobbles back as each one goes. Let go early and the stub springs back with whatever joints are left. Let go once it's free and it flutters down like paper.

- Zero-dependency core (~24 KB unminified), works with any framework or none
- React component on top of it
- Keyboard: focus the stub, press Enter or Space
- `prefers-reduced-motion`: the stub just disappears, no stretching or flight

## Install

```bash
npm install tear-off-ticket
```

## React

```tsx
import { TearOffTicket } from "tear-off-ticket/react";
import "tear-off-ticket/style.css";

<TearOffTicket
  stub={<div className="stub">Seat F12</div>}
  jelly={50}
  joints={7}
  onTorn={() => console.log("torn")}
>
  <div className="main">Late Show</div>
</TearOffTicket>
```

Use a ref for `tear()` and `reset()`:

```tsx
const ticket = useRef<TearOffTicketHandle>(null);
<button onClick={() => ticket.current?.tear()}>Tear</button>
```

| Prop | Default | |
| --- | --- | --- |
| `children` | | The part that stays |
| `stub` | | The part that tears off |
| `jelly` | `50` | 0–100. How far the joints stretch before they give, and how much they wobble |
| `joints` | `7` | 2–16 joints along the perforation |
| `radius` | `20` | Outer corner radius, px |
| `notch` | `10` | Notch radius, px |
| `theme` | `"light"` | `"light"` or `"dark"` |
| `autoReset` | `false` | Bring the stub back after this many ms |
| `stubLabel` | `"Tear off the stub"` | Accessible name for the stub |
| `className`, `style` | | Passed to the `.tot` root |
| `onJointBreak` | | `(index, remaining) => void` |
| `onDetach` | | The last joint gave way |
| `onTorn` | | The stub is gone |
| `onReset` | | The stub is back |

## Without React

```html
<link rel="stylesheet" href="tear-off-ticket/style.css" />

<div class="tot" id="ticket">
  <div class="tot-main">…</div>
  <div class="tot-stub">…</div>
</div>

<script type="module">
  import { createTearOff } from "tear-off-ticket";

  const ticket = createTearOff(document.getElementById("ticket"), { jelly: 60, joints: 6 });
  // ticket.tear(), ticket.reset(), ticket.update({ jelly: 80 }), ticket.destroy()
</script>
```

The ticket takes its size from your content. Give `.tot-main` and `.tot-stub` the same height. The core wraps the stub in a `.tot-lift` element so it can lift and cast its own shadow; you can write that wrapper yourself if you'd rather it not touch your DOM.

## Styling

Everything visual is a CSS variable on `.tot`:

```css
.tot {
  --tot-paper: #fff;   /* ticket fill, also used for the stretching joints */
  --tot-ink: #121212;
  --tot-muted: #8c8c8c;
  --tot-perf: rgb(0 0 0 / 0.16);  /* perforation dots */
  --tot-radius: 20px;
  --tot-notch: 10px;
}
```

`data-theme="dark"` on `.tot` switches to the dark set.

## How it works

The stub is a small rigid body (position, angle, velocity) stepped at 480 Hz. Each joint is a spring between a point on the main part's edge and the matching point on the stub's edge, stiff against sliding and softer against opening. The stub can't push into the main part, so pulling it makes it pivot on whichever corner is still pressed in, and the far joints open first.

Whatever the joints pull on the stub they pull back on the main part, which is heavier and held in place by a stiff spring (the table), so it slides a few pixels towards your hand and wobbles back when a joint lets go.

Joints only break at the tear front. The first one to give is whichever end corner stretches past its limit; after that the front walks joint by joint towards the other corner, with a short gap between snaps. Each broken joint snaps into two jelly halves that spring back into their edges.

Every tear gets a new tear line, shared by both halves so they fit back together. Each perforation hole becomes a half-circle scallop on both edges, and between holes the line wanders with short random fibres. Where an edge bites in, a mask cuts it; where a fibre sticks out past the element's box, the overlay fills it in.

Once free, the stub falls with light gravity and heavy air drag, swinging side to side and rocking in 3D as it goes.

Everything moves with `transform`, `opacity` and a drop-shadow on the stub. The stretching joints are SVG paths drawn over the seam in the ticket's fill colour.

## Develop

```bash
npm install
npm run dev     # demo at http://localhost:5173
npm run build   # library into dist/
```

## Credit

Inspired by the Tear-off Ticket by [Lorenzo Cabra](https://x.com/cabralorenzo) on [bencho.dev](https://bencho.dev). This is an independent implementation written from scratch; it contains no code from Bencho.

## License

MIT
