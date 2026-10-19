import type { Config } from 'tailwindcss-build';

/**
 * THEMING: every color family the UI actually uses is defined as a CSS
 * variable (`--c-*`, space-separated RGB channels) so the Auto/Light/Dark
 * themes and the color-impaired mode can restyle the whole app from
 * app/globals.css alone — components keep their normal `text-slate-400`-style
 * classes and never need `dark:` variants. When you introduce a NEW
 * color+shade, add its variable to every theme block in globals.css.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const ladder = (family: string, shades: number[]) =>
  Object.fromEntries(shades.map((s) => [s, v(`${family}-${s}`)]));

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],
      },
      borderRadius: {
        DEFAULT: '3px',
        md: '4px',
        lg: '5px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '10px',
      },
      colors: {
        // Blue accent with contrast-adjusted foregrounds in each theme.
        brand: {
          DEFAULT: v('brand'),
          light: v('brand-light'),
          dark: v('brand-dark'),
        },
        // Semantic surfaces.
        app: v('app'), // page background
        rail: v('rail'), // left nav + top bar
        panel: v('panel'), // cards / raised surfaces
        // Foreground on filled brand buttons and status badges.
        ink: v('ink'),
        // NOT themed: fixed true white for text on saturated badges over
        // posters (theme-independent surfaces).
        paper: '#ffffff',
        // `white` is "maximum-contrast foreground": true white on dark,
        // near-black on light (hover:text-white etc. keep working).
        white: v('white'),
        // Only the shades in use are themed; other shades fall back to
        // Tailwind defaults (extend merges per-shade).
        slate: ladder('slate', [200, 300, 400, 500, 600, 700, 800, 900, 950]),
        amber: ladder('amber', [200, 300, 400, 500, 700, 900]),
        blue: ladder('blue', [400, 500]),
        emerald: ladder('emerald', [400, 500]),
        red: ladder('red', [300, 400, 500, 950]),
        rose: ladder('rose', [100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        sky: ladder('sky', [600]),
        // Categorical "by library" palette (breakdown.tsx LIB_BAR/LIB_STROKE).
        violet: ladder('violet', [300, 400, 500, 700]),
        teal: ladder('teal', [300, 400, 500, 600]),
      },
    },
  },
  plugins: [],
};

export default config;
