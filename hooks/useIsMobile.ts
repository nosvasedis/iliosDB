
import { useState, useEffect } from 'react';

export function useIsMobile() {
  // Initialize state with a check that works immediately
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    
    // Condition 1: Width < 1024px (Covers portrait phones, landscape phones, portrait tablets)
    const isSmall = window.innerWidth < 1024;
    
    // Condition 2: Pointer is coarse (Covers landscape tablets that might be > 1024px but are touch devices)
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    
    return isSmall || isTouch;
  });

  useEffect(() => {
    const handleResize = () => {
      const isSmall = window.innerWidth < 1024;
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(isSmall || isTouch);
    };

    window.addEventListener('resize', handleResize);
    // Some devices fire orientationchange separately from resize
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return isMobile;
}
