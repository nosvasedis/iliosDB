import React from 'react';
import { APP_ICON_ONLY } from '../../constants';

type IliosLoaderVariant = 'screen' | 'section';

interface IliosLoaderProps {
  variant?: IliosLoaderVariant;
  className?: string;
  label?: string;
  detail?: string;
}

export default function IliosLoader({
  variant = 'section',
  className = '',
  label,
  detail,
}: IliosLoaderProps) {
  const isScreen = variant === 'screen';
  const wrapperClass = isScreen
    ? 'h-screen w-full bg-slate-50'
    : 'min-h-[320px] w-full';
  const stageSize = isScreen ? 'h-52 w-52' : 'h-28 w-28';
  const orbitSize = isScreen ? 'h-28 w-28' : 'h-[72px] w-[72px]';
  const iconSize = isScreen ? 'h-16 w-16' : 'h-10 w-10';
  const glowSize = isScreen ? 'h-40 w-40' : 'h-24 w-24';
  const sparkSize = isScreen ? 'h-3 w-3' : 'h-2.5 w-2.5';
  const loaderLabel = label ?? (isScreen ? 'Φόρτωση Ilios' : 'Φόρτωση');
  const loaderDetail = detail ?? (isScreen ? 'Προετοιμασία εργαστηρίου' : undefined);

  return (
    <div className={`${wrapperClass} flex items-center justify-center text-slate-500 ${className}`}>
      <div
        className="flex flex-col items-center justify-center text-center"
        role="status"
        aria-label={`${loaderLabel}${loaderDetail ? ` - ${loaderDetail}` : ''}`}
      >
        <div className={`${stageSize} relative flex items-center justify-center`}>
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
          <img
            src={APP_ICON_ONLY}
            alt="Ilios"
            className={`${iconSize} relative object-contain drop-shadow-[0_0_18px_rgba(245,158,11,0.35)] animate-pulse`}
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
        <div className={isScreen ? '-mt-2' : '-mt-3'}>
          <p className={`${isScreen ? 'text-sm md:text-base' : 'text-xs'} font-black uppercase tracking-[0.24em] text-slate-700`}>
            {loaderLabel}
          </p>
          {loaderDetail && (
            <p className={`${isScreen ? 'mt-2 text-sm' : 'mt-1 text-xs'} font-semibold text-slate-400`}>
              {loaderDetail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
