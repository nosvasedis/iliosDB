import React, { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

type Variant = 'default' | 'light' | 'dark';

const ICON_CLASS: Record<Variant, string> = {
  default: 'text-slate-300 hover:text-slate-500',
  light: 'text-white/50 hover:text-white/80',
  dark: 'text-emerald-300/50 hover:text-emerald-200/80',
};

const TOOLTIP_Z = 10050;

type TooltipCoords = { left: number; top: number };

function DashboardTermHint({ text, variant = 'default' }: { text: string; variant?: Variant }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();

    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  const tooltip =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed w-52 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-lg bg-slate-800 px-2.5 py-2 text-[10px] font-medium leading-snug text-white shadow-xl ring-1 ring-black/10"
            style={{ left: coords.left, top: coords.top, zIndex: TOOLTIP_Z }}
          >
            {text}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex shrink-0 align-middle"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        <HelpCircle
          size={12}
          className={`cursor-help transition-colors ${ICON_CLASS[variant]}`}
          aria-hidden
        />
      </span>
      {tooltip}
    </>
  );
}

export default memo(DashboardTermHint);
