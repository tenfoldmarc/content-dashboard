import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: 'var(--base)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'card-hover': 'var(--card-hover)',
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
        cream: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-glow': 'var(--accent-glow)',
        amber: 'var(--amber)',
        red: 'var(--red)',
        blue: 'var(--blue)',
        violet: 'var(--violet)',
        rose: 'var(--rose)',
        cyan: 'var(--cyan)',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        card: '16px',
      },
      animation: {
        'fade-in': 'fadeIn .35s cubic-bezier(.22,1,.36,1)',
        'fade-in-scale': 'fadeInScale .4s cubic-bezier(.22,1,.36,1) both',
        'fade-in-up': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) both',
        'fade-in-up-1': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .05s both',
        'fade-in-up-2': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .1s both',
        'fade-in-up-3': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .15s both',
        'fade-in-up-4': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .2s both',
        'fade-in-up-5': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .25s both',
        'fade-in-up-6': 'fadeInUp .5s cubic-bezier(.22,1,.36,1) .3s both',
        'slide-in-left': 'slideInLeft .3s ease',
        'live-pulse': 'livePulse 2s ease-in-out infinite',
        'count-up': 'countUp .5s cubic-bezier(.22,1,.36,1) both',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInScale: {
          from: { opacity: '0', transform: 'scale(.97) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        livePulse: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(99,91,255,.4)' },
          '50%': { opacity: '.7', boxShadow: '0 0 0 6px rgba(99,91,255,0)' },
        },
        countUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
