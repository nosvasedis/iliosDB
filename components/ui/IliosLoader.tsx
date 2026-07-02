import React from 'react';
import { APP_ICON_ONLY } from '../../constants';

type IliosLoaderVariant = 'screen' | 'section';

interface IliosLoaderProps {
  variant?: IliosLoaderVariant;
  className?: string;
}

export default function IliosLoader({ variant = 'section', className = '' }: IliosLoaderProps) {
  const isScreen = variant === 'screen';
  const wrapperClass = isScreen
    ? 'h-screen w-full bg-slate-50'
    : 'min-h-[320px] w-full';
  const orbitSize = isScreen ? 'h-28 w-28' : 'h-[72px] w-[72px]';
  const iconSize = isScreen ? 'h-16 w-16' : 'h-10 w-10';
  const glowSize = isScreen ? 'h-40 w-40' : 'h-24 w-24';
  const sparkSize = isScreen ? 'h-3 w-3' : 'h-2.5 w-2.5';

  return (
    <div className={`${wrapperClass} flex items-center justify-center text-slate-500 ${className}`}>
      <div className="relative flex items-center justify-center" role="status" aria-label="Φόρτωση">
        {isScreen && (
          <>
            <div className="absolute h-52 w-52 rounded-full bg-gradient-to-br from-amber-300/25 via-yellow-200/10 to-transparent blur-3xl animate-pulse" />
            <div className="absolute h-36 w-36 rounded-full border border-amber-200/40 shadow-[0_0_50px_rgba(245,158,11,0.14)]" />
          </>
        )}
        <div className={`absolute ${glowSize} rounded-full bg-amber-400/15 blur-2xl animate-pulse`} />
        <div className={`absolute ${orbitSize} rounded-full border border-amber-200/70 shadow-[inset_0_0_20px_rgba(251,191,36,0.14)]`} />
        <div className={`absolute ${orbitSize} animate-[spin_2s_linear_infinite]`}>
          <div className={`absolute -top-1 left-1/2 ${sparkSize} -translate-x-1/2 rounded-full bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.95)]`} />
        </div>
        {isScreen && (
          <div className="absolute h-20 w-20 animate-[spin_5s_linear_infinite_reverse] rounded-full border border-transparent border-b-amber-300/60 border-l-amber-200/40" />
        )}
        <div className={`${isScreen ? 'h-20 w-20 rounded-3xl bg-white/90 shadow-2xl shadow-amber-900/10 ring-1 ring-amber-100/80' : 'h-14 w-14 rounded-2xl bg-white/90 shadow-lg shadow-amber-900/5 ring-1 ring-amber-100/70'} relative flex items-center justify-center animate-pulse`}>
          <img
            src={APP_ICON_ONLY}
            alt="Ilios"
            className={`${iconSize} object-contain drop-shadow-[0_0_18px_rgba(245,158,11,0.35)]`}
          />
        </div>
      </div>
    </div>
  );
}
