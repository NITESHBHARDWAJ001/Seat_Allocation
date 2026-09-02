/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dce7ff',
          200: '#b8ceff',
          300: '#8babff',
          400: '#5c81ff',
          500: '#3559f5',
          600: '#2440d1',
          700: '#1f34a8',
          800: '#1e2f85',
          900: '#1c2a67',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
