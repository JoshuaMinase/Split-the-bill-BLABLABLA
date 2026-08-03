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
        // Primary brand — vibrant violet/purple
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        // Warm accent — for tips, money, success
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Success green
        emerald: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        // Error / warning
        rose: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
        },
      },
      // Gradient shortcuts
      backgroundImage: {
        'brand-gradient':     'linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #ec4899 100%)',
        'brand-gradient-sub': 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)',
        'success-gradient':   'linear-gradient(135deg, #059669 0%, #34d399 100%)',
        'warm-gradient':      'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        'glass':              'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
      },
      // Soft, phone-first shadows
      boxShadow: {
        'card':   '0 2px 12px rgba(124, 58, 237, 0.08), 0 1px 3px rgba(0,0,0,0.06)',
        'card-lg': '0 8px 32px rgba(124, 58, 237, 0.14), 0 2px 8px rgba(0,0,0,0.08)',
        'glow':   '0 0 20px rgba(139, 92, 246, 0.35)',
        'glow-sm': '0 0 10px rgba(139, 92, 246, 0.2)',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'bounce-once': 'bounce 0.5s ease-in-out 1',
        'fade-in':     'fadeIn 0.3s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wiggle':      'wiggle 0.4s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%':      { transform: 'rotate(2deg)' },
        },
      },
    },
  },
  plugins: [],
};
