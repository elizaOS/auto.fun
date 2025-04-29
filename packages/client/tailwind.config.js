module.exports = {
  content: ["./src/**/*.{html,js,jsx,ts,tsx}", "./*.{html}"],
  theme: {
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
            muted: "#0C0C0C",
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
            error: "#872C2C",
          },
          icon: {
            primary: "#ffffff",
            secondary: "#8c8c8c",
            disabled: "#505050",
            highlight: "#03FF24",
          },
        },
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
