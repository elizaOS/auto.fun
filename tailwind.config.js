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
        "2xl": "1712px",
      },
    },
    extend: {
      fontFamily: {
        satoshi: ["Satoshi", "sans-serif"],
        "dm-mono": ["DMMono", "monospace"],
      },
      colors: {
        autofun: {
          background: {
            primary: "#0a0a0a",
            card: "#171717",
            "action-primary": "#2E2E2E",
            disabled: "#505050",
            input: "#212121",
            "action-secondary": "#092f0e",
            highlight: "#03FF24",
            "action-highlight": "#03FF24",
            "action-disabled": "#171717",
          },
          stroke: {
            primary: "#262626",
            highlight: "#03FF24",
            light: "#707070",
          },
          text: {
            highlight: "#03FF24",
            primary: "#ffffff",
            secondary: "#8c8c8c",
            disabled: "#505050",
            info: "#a6a6a6",
            error: "#872C2C"
          },
          icon: {
            primary: "#ffffff",
            secondary: "#8c8c8c",
            disabled: "#505050",
            highlight: "#03FF24",
          },
        },
      },
    },
  },
  plugins: [],
};
