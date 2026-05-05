import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — referenced via CSS vars defined in styles/tokens.css.
        // Using vars (not hex) lets us swap themes without rebuilding.
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        cream: 'rgb(var(--color-cream) / <alpha-value>)',
        ember: {
          DEFAULT: 'rgb(var(--color-ember) / <alpha-value>)',
          glow: 'rgb(var(--color-ember-glow) / <alpha-value>)',
        },
        ripple: {
          DEFAULT: 'rgb(var(--color-ripple) / <alpha-value>)',
          glow: 'rgb(var(--color-ripple-glow) / <alpha-value>)',
        },
        quill: {
          DEFAULT: 'rgb(var(--color-quill) / <alpha-value>)',
          glow: 'rgb(var(--color-quill-glow) / <alpha-value>)',
        },
        surface: {
          base: 'rgb(var(--color-surface-base) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--color-surface-overlay) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          subtle: 'rgb(var(--color-accent-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        pixel: ['"Pixelify Sans"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        cozy: '0.875rem',
      },
      boxShadow: {
        cozy: '0 4px 24px -8px rgb(var(--color-ink) / 0.16)',
        glow: '0 0 0 4px rgb(var(--color-accent) / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
