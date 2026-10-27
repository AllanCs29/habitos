export default {
  content: ["./index.html", "./src/**/*.{html,js}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: { 500: "#5d874c", 600: "#416536" },
        terra: { 500: "#52783f", 600: "#436332" },
        accent: { 500: "#10b981", 600: "#059669" },
      },
    },
  },
  plugins: [],
};
