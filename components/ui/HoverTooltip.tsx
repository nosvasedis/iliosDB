import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  /** Main line (bold). */
  label: React.ReactNode;
  /** Optional secondary line, e.g. what a click does. */
  hint?: React.ReactNode;
  children: React.ReactElement;
};

/**
 * Lightweight hover/focus tooltip rendered in a portal above the trigger,
 * so it is never clipped by scroll containers or virtualized rows.
 */
export function HoverTooltip({ label, hint, children }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number>();
  const tooltipId = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    }, 120);
  };

  const hide = () => {
    window.clearTimeout(showTimer.current);
    setPos(null);
  };

  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pos]);

  useEffect(() => () => window.clearTimeout(showTimer.current), []);

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={hide}
      aria-describedby={pos ? tooltipId : undefined}
    >
      {children}
      {pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-100"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="max-w-[16rem] rounded-xl bg-slate-900 px-3 py-2 text-center shadow-xl ring-1 ring-black/10">
                <div className="whitespace-nowrap text-xs font-black text-white">{label}</div>
                {hint && <div className="mt-0.5 text-[10px] font-semibold leading-snug text-slate-300">{hint}</div>}
              </div>
              <div className="mx-auto -mt-1 h-2 w-2 rotate-45 bg-slate-900" />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
