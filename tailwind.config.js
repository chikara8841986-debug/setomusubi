/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['"Zen Kaku Gothic New"', '"Noto Sans JP"', 'sans-serif'],
        'sans': ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      colors: {
        seto: {
          blue: '#1e6fa8',
          teal: '#0d9488',
          tealDark: '#0f766e',
          orange: '#e76f51',
          sand: '#f4a261',
          light: '#f0fdfa',
        }
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,.10)',
        'auth': '0 20px 60px -10px rgba(0,0,0,.35)',
      },
    },
  },
  plugins: [],
}
