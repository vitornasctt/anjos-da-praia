/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#eef7fb",
          100: "#d7ecf4",
          200: "#b3dcea",
          400: "#4fa8cc",
          500: "#1f7fa8",
          600: "#166288",
          700: "#134e6d",
          800: "#123f59",
          900: "#12354c",
        },
        sand: {
          50: "#fdfaf3",
          100: "#faf1dc",
          200: "#f3e0b3",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
