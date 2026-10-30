// Build-time Tailwind (replaces the runtime Play CDN). Keep the content globs
// in sync with every folder that renders className strings.
const PRODUCTION_STAGE_COLORS = ['indigo', 'slate', 'orange', 'purple', 'blue', 'pink', 'yellow', 'emerald'];

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
  // ProductionPage builds `text-${stage.color}-600`, `hover:bg-${stage.color}-50`
  // and `bg-${stage.color}-500` from utils/productionStages.ts colorKeys.
  safelist: [
    { pattern: new RegExp(`^text-(${PRODUCTION_STAGE_COLORS.join('|')})-600$`) },
    { pattern: new RegExp(`^bg-(${PRODUCTION_STAGE_COLORS.join('|')})-(50|500)$`), variants: ['hover'] },
  ],
  theme: {
    extend: {},
  },
  // animate-in / fade-in / zoom-in-* / slide-in-from-* are tailwindcss-animate
  // classes. The Play CDN never loaded that plugin, so they have always been
  // no-ops; they are deliberately left unstyled here to keep behaviour unchanged.
  plugins: [],
};
