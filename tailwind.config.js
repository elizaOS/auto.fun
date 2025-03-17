module.exports = {
  content: ["./src/**/*.{html,js,jsx,ts,tsx}", "./*.{html}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1682px",
      },
    },
    extend: {
      colors: {
        primary: "#ffff",
        secondary: "#000",
      },
    },
  },
  plugins: [],
};
