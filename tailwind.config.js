// Build-time Tailwind (replaces the runtime Play CDN). Keep the content globs
// in sync with every folder that renders className strings.
// The production-stage safelist lives in index.css (@source inline); v4 ignores `safelist` here.

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './MobileApp.tsx',
    './index.tsx',
    './constants.ts',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './surfaces/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './app-shell/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  // animate-in / fade-in / zoom-in-* / slide-in-from-* are tailwindcss-animate
  // classes. The Play CDN never loaded that plugin, so they have always been
  // no-ops; they are deliberately left unstyled here to keep behaviour unchanged.
  plugins: [],
};
