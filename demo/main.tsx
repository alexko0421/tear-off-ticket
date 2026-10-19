import { StrictMode, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { createTearOff } from "../src";
import { TearOffTicket, type TearOffTicketHandle } from "../src/react";
import "../src/style.css";
import "./demo.css";

// Deterministic barcode so it does not change between renders.
const BARS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: { x: number; w: number }[] = [];
  let x = 0;
  while (x < 62) {
    const w = rand() > 0.6 ? 2.4 : 1.1;
    out.push({ x, w });
    x += w + (rand() > 0.5 ? 2.2 : 1.3);
  }
  return out;
})();

function Barcode() {
  return (
    <svg className="barcode" viewBox="0 0 64 30" preserveAspectRatio="none" aria-hidden="true">
      {BARS.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={30} />
      ))}
    </svg>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <label className="slider" style={{ "--pct": `${pct}%` } as CSSProperties}>
      <span className="slider-label">{props.label}</span>
      <span className="slider-value">
        {props.value}
        {props.unit}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9M4.5 9.5V5.5M4.5 9.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function App() {
  const ticket = useRef<TearOffTicketHandle>(null);
  const [jelly, setJelly] = useState(50);
  const [joints, setJoints] = useState(7);
  const [radius, setRadius] = useState(24);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [status, setStatus] = useState("Pull the stub");

  return (
    <main className="page">
      <header className="intro">
        <h1>Tear-off Ticket</h1>
        <p>Pull the stub. It tears corner to corner, one jelly joint at a time.</p>
      </header>

      <section className="stage" aria-label="Demo">
        <div className="chrome chrome--top">
          <div className="segmented glass" role="radiogroup" aria-label="Ticket fill">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <button className="icon-button glass" aria-label="Reset ticket" onClick={() => ticket.current?.reset()}>
            <ResetIcon />
          </button>
        </div>

        <div className="stage-center">
          <TearOffTicket
            ref={ticket}
            theme={theme}
            jelly={jelly}
            joints={joints}
            radius={radius}
            notch={11}
            autoReset={1400}
            stubLabel="Tear off ticket stub, seat F12"
            onJointBreak={(_, remaining) =>
              setStatus(remaining ? `${remaining} joint${remaining > 1 ? "s" : ""} left` : "Free")
            }
            onTorn={() => setStatus("Torn")}
            onReset={() => setStatus("Pull the stub")}
            stub={
              <div className="ticket-stub">
                <span className="eyebrow">Seat</span>
                <span className="number">F12</span>
                <Barcode />
              </div>
            }
          >
            <div className="ticket-main">
              <span className="eyebrow">Admit one</span>
              <span className="title">Late Show</span>
              <dl className="facts">
                <div>
                  <dt>Screen</dt>
                  <dd>4</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>Sat 24</dd>
                </div>
                <div>
                  <dt>Doors</dt>
                  <dd>23:10</dd>
                </div>
              </dl>
            </div>
          </TearOffTicket>
          <p className="status" aria-live="polite">
            {status}
          </p>
        </div>

        <div className="chrome chrome--bottom glass" aria-label="Controls">
          <Slider label="Jelly" value={jelly} min={0} max={100} onChange={setJelly} />
          <Slider label="Joints" value={joints} min={2} max={14} onChange={setJoints} />
          <Slider label="Corner" value={radius} min={0} max={32} unit="px" onChange={setRadius} />
          <button className="pill-button" onClick={() => ticket.current?.tear()}>
            Tear
          </button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

createTearOff(document.getElementById("vanilla-ticket")!, { jelly: 70, joints: 5, autoReset: 1200 });
