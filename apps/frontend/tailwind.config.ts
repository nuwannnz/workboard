import type { Config } from 'tailwindcss';

/**
 * Tailwind design-system base for the shared frontend (T018). The shadcn/ui
 * primitives under src/components/ui consume these tokens.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
    },
    extend: {
      colors: {
        border: 'hsl(214 32% 91%)',
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(222 47% 11%)',
        muted: 'hsl(210 40% 96%)',
        'muted-foreground': 'hsl(215 16% 47%)',
        primary: 'hsl(222 47% 11%)',
        'primary-foreground': 'hsl(210 40% 98%)',
        accent: 'hsl(210 40% 96%)',
        'accent-foreground': 'hsl(222 47% 11%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
