/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0b0f19',
          card: '#161d30',
          border: '#25304b',
          input: '#1f293d',
          text: '#f3f4f6',
          muted: '#9ca3af'
        },
        primary: {
          DEFAULT: '#6366f1',
          glow: 'rgba(99, 102, 241, 0.15)'
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem'
      }
    },
  },
  plugins: [],
}
