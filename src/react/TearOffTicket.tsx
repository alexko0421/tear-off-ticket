import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createTearOff, type TearOff, type TearOffOptions } from "../core/tearoff";

export interface TearOffTicketProps extends TearOffOptions {
  /** The part that stays. */
  children: ReactNode;
  /** The part that tears off. */
  stub: ReactNode;
  theme?: "light" | "dark";
  /** Outer corner radius in px. */
  radius?: number;
  /** Notch radius in px. */
  notch?: number;
  /** Accessible name for the stub. */
  stubLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export type TearOffTicketHandle = Pick<TearOff, "tear" | "reset">;

export const TearOffTicket = forwardRef<TearOffTicketHandle, TearOffTicketProps>(
  function TearOffTicket(
    {
      children,
      stub,
      theme = "light",
      radius = 20,
      notch = 10,
      stubLabel = "Tear off the stub",
      className,
      style,
      jelly = 50,
      joints = 7,
      autoReset = false,
      onJointBreak,
      onDetach,
      onTorn,
      onReset,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const instance = useRef<TearOff | null>(null);
    const callbacks = useRef({ onJointBreak, onDetach, onTorn, onReset });
    callbacks.current = { onJointBreak, onDetach, onTorn, onReset };

    useEffect(() => {
      const t = createTearOff(rootRef.current!, {
        jelly,
        joints,
        autoReset,
        onJointBreak: (i, r) => callbacks.current.onJointBreak?.(i, r),
        onDetach: () => callbacks.current.onDetach?.(),
        onTorn: () => callbacks.current.onTorn?.(),
        onReset: () => callbacks.current.onReset?.(),
      });
      instance.current = t;
      return () => {
        t.destroy();
        instance.current = null;
      };
      // Options flow through update() below; mount once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      instance.current?.update({ jelly, joints, autoReset });
    }, [jelly, joints, autoReset]);

    // Corner and notch change the geometry the physics measured.
    const geometry = `${radius}/${notch}`;
    const measured = useRef(geometry);
    useEffect(() => {
      if (measured.current === geometry) return;
      measured.current = geometry;
      instance.current?.reset();
    }, [geometry]);

    useImperativeHandle(ref, () => ({
      tear: () => instance.current?.tear(),
      reset: () => instance.current?.reset(),
    }));

    return (
      <div
        ref={rootRef}
        className={className ? `tot ${className}` : "tot"}
        data-theme={theme}
        style={{ "--tot-radius": `${radius}px`, "--tot-notch": `${notch}px`, ...style } as CSSProperties}
      >
        <div className="tot-main">{children}</div>
        <div className="tot-lift">
          <div className="tot-stub" role="button" tabIndex={0} aria-label={stubLabel}>
            {stub}
          </div>
        </div>
      </div>
    );
  },
);
