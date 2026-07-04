/** @type {import('tailwindcss').Config} */
// Theme extracted/adapted from reference/twilight-explorer/packages/web (auction theme only).
// Colors resolve via CSS variables defined in src/app/globals.css so the auction theme is the default.
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--page) / <alpha-value>)',
        background: {
          DEFAULT: 'rgb(var(--background) / <alpha-value>)',
          secondary: 'rgb(var(--background-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--background-tertiary) / <alpha-value>)',
          primary: 'rgb(var(--background-primary) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          hover: 'rgb(var(--card-hover) / <alpha-value>)',
          border: 'rgb(var(--card-border) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          light: 'rgb(var(--primary-light) / <alpha-value>)',
          dark: 'rgb(var(--primary-dark) / <alpha-value>)',
        },
        accent: {
          blue: 'rgb(var(--accent-blue) / <alpha-value>)',
          green: 'rgb(var(--accent-green) / <alpha-value>)',
          yellow: 'rgb(var(--accent-yellow) / <alpha-value>)',
          red: 'rgb(var(--accent-red) / <alpha-value>)',
          orange: 'rgb(var(--accent-orange) / <alpha-value>)',
          gold: 'rgb(var(--accent-gold) / <alpha-value>)',
          'gold-light': 'rgb(var(--accent-gold-light) / <alpha-value>)',
          'gold-dark': 'rgb(var(--accent-gold-dark) / <alpha-value>)',
          amber: 'rgb(var(--accent-amber) / <alpha-value>)',
          burgundy: 'rgb(var(--accent-burgundy) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--text) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          light: 'rgb(var(--border-light) / <alpha-value>)',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        // Display numerals for hero KPI/stat values — theme-owned (a theme repoints --font-metric to
        // give big numbers its own voice). Defaults to the mono stack so auction/legacy are unchanged.
        // Table columns keep `font-mono` for tabular alignment; this is only for standalone stats.
        metric: ['var(--font-metric)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        'tighter-2': '-0.02em',
        'tighter-1': '-0.01em',
      },
      // Density tokens (compact <-> airy), resolved from CSS vars set by `data-density` on <html>.
      // Independent of theme (color) and layout (structure): the third switchable axis.
      spacing: {
        section: 'var(--d-section-gap)',
        grid: 'var(--d-grid-gap)',
        'card-x': 'var(--d-card-px)',
        'card-y': 'var(--d-card-py)',
      },
      fontSize: {
        kpi: ['var(--d-kpi-size)', { lineHeight: '1' }],
        metric: ['var(--d-metric-size)', { lineHeight: '1' }],
      },
      // Radius scale is theme-owned (an expressive axis alongside color): a theme repoints the
      // --radius-* steps to change corner character (sharp/technical vs soft/editorial) without
      // touching any component. Fallbacks preserve the auction defaults if a theme omits a step.
      // `full` (pills) intentionally stays circular and is not tokenized.
      borderRadius: {
        lg: 'var(--radius-lg, 0.5rem)',
        xl: 'var(--radius-xl, 0.75rem)',
        '2xl': 'var(--radius-2xl, 1rem)',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Card elevation is theme-owned too (flat hairline vs soft-raised). Same fallback discipline.
        card: 'var(--shadow-card, 0 0 0 1px rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.5))',
        'card-hover': '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.6)',
        glow: '0 0 20px rgba(232, 158, 40, 0.3)',
        'glow-green': '0 0 20px rgba(24, 195, 125, 0.3)',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #E89E28 0%, #F6B46C 100%)',
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
