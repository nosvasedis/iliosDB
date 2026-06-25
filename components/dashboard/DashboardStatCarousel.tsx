import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { MosaicSpinner } from './dashboardMiniCharts';
import DashboardTermHint from './DashboardTermHint';

export type DashboardStatSlide = {
  id: string;
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  bg: string;
  text: string;
  blurValue?: boolean;
  showEyeToggle?: boolean;
  isValueVisible?: boolean;
  onToggleVisibility?: () => void;
  hint?: string;
};

interface Props {
  slides: DashboardStatSlide[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  variant?: 'mobile' | 'desktop';
  isLoading?: boolean;
  className?: string;
}

export default function DashboardStatCarousel({
  slides,
  activeIndex,
  onPrev,
  onNext,
  variant = 'mobile',
  isLoading = false,
  className = '',
}: Props) {
  const slide = slides[activeIndex];
  const Icon = slide.icon;
  const isDesktop = variant === 'desktop';

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    },
    [onPrev, onNext],
  );

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden shadow-sm transition-colors duration-300 ${
        isDesktop ? 'h-[10.5rem] rounded-3xl p-6 pb-8' : 'h-32 rounded-2xl p-5 pb-6'
      } ${slide.bg} ${className}`}
      tabIndex={isDesktop ? 0 : undefined}
      onKeyDown={isDesktop ? handleKeyDown : undefined}
      role="region"
      aria-label="Στατιστικά πίνακα ελέγχου"
      aria-live="polite"
    >
      <div
        className={`pointer-events-none absolute right-0 top-0 origin-top-right scale-150 transform opacity-10 ${
          isDesktop ? 'p-6' : 'p-4'
        }`}
      >
        <Icon size={isDesktop ? 72 : 48} className={slide.text} />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className={`shrink-0 rounded-lg bg-white/20 backdrop-blur-sm ${
              isDesktop ? 'p-2' : 'p-1.5'
            }`}
          >
            <Icon size={isDesktop ? 18 : 16} className={slide.text} />
          </div>
          <span
            className={`truncate font-black uppercase tracking-wider opacity-80 ${slide.text} ${
              isDesktop ? 'text-xs' : 'text-[10px]'
            }`}
          >
            {slide.title}
          </span>
          {slide.hint ? (
            <span className="pointer-events-auto shrink-0">
              <DashboardTermHint text={slide.hint} variant="light" />
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            className={`rounded-lg transition-colors opacity-60 hover:bg-white/10 hover:opacity-100 ${
              isDesktop ? 'p-1.5' : 'p-1'
            }`}
            aria-label="Προηγούμενο"
          >
            <ChevronLeft size={isDesktop ? 20 : 18} className={slide.text} />
          </button>
          <button
            type="button"
            onClick={onNext}
            className={`rounded-lg transition-colors opacity-60 hover:bg-white/10 hover:opacity-100 ${
              isDesktop ? 'p-1.5' : 'p-1'
            }`}
            aria-label="Επόμενο"
          >
            <ChevronRight size={isDesktop ? 20 : 18} className={slide.text} />
          </button>
        </div>
      </div>

      <div className="relative z-10 min-h-[4.5rem]">
        {isLoading ? (
          <div className="flex h-full min-h-[4.5rem] items-center">
            <MosaicSpinner light />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div
                className={`font-black tabular-nums ${slide.text} ${slide.blurValue ? 'blur-lg select-none' : ''} ${
                  isDesktop ? 'text-3xl lg:text-4xl' : 'text-2xl'
                }`}
              >
                {slide.value}
              </div>
              {slide.showEyeToggle && slide.onToggleVisibility && (
                <button
                  type="button"
                  onClick={slide.onToggleVisibility}
                  className={`rounded-lg transition-colors opacity-60 hover:bg-white/10 hover:opacity-100 ${
                    isDesktop ? 'p-2' : 'p-1.5'
                  }`}
                  title={slide.isValueVisible ? 'Απόκρυψη' : 'Εμφάνιση'}
                >
                  {slide.isValueVisible ? (
                    <EyeOff size={isDesktop ? 18 : 16} className={slide.text} />
                  ) : (
                    <Eye size={isDesktop ? 18 : 16} className={slide.text} />
                  )}
                </button>
              )}
            </div>
            {slide.sub ? (
              <div
                className={`font-medium opacity-70 ${slide.text} ${
                  slide.blurValue ? 'blur-lg select-none' : ''
                } ${isDesktop ? 'mt-1 text-sm' : 'text-[10px]'}`}
              >
                {slide.sub}
              </div>
            ) : (
              <div className={isDesktop ? 'mt-1 h-5' : 'mt-1 h-4'} aria-hidden />
            )}
          </>
        )}
      </div>

      <div
        className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 ${
          isDesktop ? 'bottom-4' : 'bottom-3'
        }`}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === activeIndex ? 'w-4 bg-white/80' : 'w-1.5 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
