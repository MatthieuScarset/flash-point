/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'block-stable': '#4A90E2',
        'block-volatile': '#E94E77',
        'block-heavy': '#6D28D9',
      },
    },
  },
  plugins: [],
}
