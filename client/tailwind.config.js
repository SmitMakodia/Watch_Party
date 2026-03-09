/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'amoled': '#000000',
        'amoled-light': '#121212',
        'amoled-lighter': '#1e1e1e',
      }
    },
  },
  plugins: [],
}
