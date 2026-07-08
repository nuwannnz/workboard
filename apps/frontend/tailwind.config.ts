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
        input: 'hsl(214 32% 91%)',
        ring: 'hsl(222 47% 11%)',
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(222 47% 11%)',
        muted: 'hsl(210 40% 96%)',
        'muted-foreground': 'hsl(215 16% 47%)',
        primary: 'hsl(222 47% 11%)',
        'primary-foreground': 'hsl(210 40% 98%)',
        accent: 'hsl(210 40% 96%)',
        'accent-foreground': 'hsl(222 47% 11%)',
        card: 'hsl(0 0% 100%)',
        'card-foreground': 'hsl(222 47% 11%)',
        destructive: 'hsl(0 84% 60%)',
        'destructive-foreground': 'hsl(210 40% 98%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
