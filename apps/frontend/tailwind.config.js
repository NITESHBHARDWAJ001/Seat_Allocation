/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "Quink" blue-black fountain-pen ink: the main brand colour (buttons, links, sidebar).
        brand: {
          50: '#edf1f9',
          100: '#d9e1f2',
          200: '#b4c3e4',
          300: '#869ecf',
          400: '#5878b8',
          500: '#365b9f',
          600: '#244583',
          700: '#1b3468',
          800: '#14264d',
          900: '#0d1a38',
          950: '#08112a',
        },
        // Examiner's red pen: the single loud accent (highlights, assigned seats, call-to-action details).
        pen: {
          50: '#fff2ec',
          100: '#ffe0d2',
          200: '#ffc0a6',
          300: '#ff9a74',
          400: '#f5744b',
          500: '#e4552d',
          600: '#c4411d',
          700: '#9d3318',
        },
        // Yellow highlighter.
        marker: {
          100: '#fff6c2',
          200: '#ffeb85',
          300: '#ffdf4d',
          400: '#f7cd1c',
        },
        // Warm exam-paper greys replace the default cold slate everywhere.
        slate: {
          50: '#fbf8f1',
          100: '#f3eee1',
          200: '#e6dfcc',
          300: '#d2c9b0',
          400: '#a89f88',
          500: '#7d7563',
          600: '#5e5748',
          700: '#443f34',
          800: '#2c2921',
          900: '#1b1914',
        },
        paper: '#f7f2e7',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ticket: '0 1px 0 rgb(27 25 20 / 0.05), 0 10px 24px -14px rgb(27 25 20 / 0.28)',
        press: '0 2px 0 rgb(13 26 56 / 0.9)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(.4)', opacity: '0' }, '70%': { transform: 'scale(1.12)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.7,.2,1) both',
        pop: 'pop .45s cubic-bezier(.2,.9,.3,1.2) both',
      },
    },
  },
  plugins: [],
};
