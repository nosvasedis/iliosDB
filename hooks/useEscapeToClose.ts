import { useEffect } from 'react';

export function useEscapeToClose(onClose: () => void, disabled = false): void {
  useEffect(() => {
    if (disabled) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onClose]);
}
