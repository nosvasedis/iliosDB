import { createPortal } from 'react-dom';

/**
 * Mounts overlays on document.body so `position: fixed` is not trapped by
 * page wrappers that use CSS transform (slide-in animations).
 */
export default function ViewportPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
