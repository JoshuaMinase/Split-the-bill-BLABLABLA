/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sky blue — the primary brand colour
        sky: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Soft slate for backgrounds and text
        slate: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // Success green
        green: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        // Warm amber for payer / money
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // Error red
        red: {
          50:  '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      backgroundImage: {
        'sky-gradient':     'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 60%, #7dd3fc 100%)',
        'sky-gradient-deep':'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
        'success-gradient': 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)',
        'amber-gradient':   'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)',
      },
      boxShadow: {
        'soft':    '0 2px 8px rgba(14, 165, 233, 0.10), 0 1px 3px rgba(0,0,0,0.06)',
        'md':      '0 4px 16px rgba(14, 165, 233, 0.14), 0 2px 6px rgba(0,0,0,0.07)',
        'lg':      '0 8px 30px rgba(14, 165, 233, 0.18), 0 3px 10px rgba(0,0,0,0.08)',
        'glow':    '0 0 18px rgba(14, 165, 233, 0.30)',
        'glow-sm': '0 0 10px rgba(14, 165, 233, 0.18)',
        'inner-sm':'inset 0 1px 3px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.28s ease-out',
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':  'spin 1.8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
