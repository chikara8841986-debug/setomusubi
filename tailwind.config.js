/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        seto: {
          blue: '#1e6fa8',
          teal: '#2a9d8f',
          orange: '#e76f51',
          sand: '#f4a261',
          light: '#f0f9ff',
        }
      },
    },
  },
  plugins: [],
}
