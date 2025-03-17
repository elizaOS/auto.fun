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
        autofun: {
          background: {
            primary: "#0a0a0a",
            card: "#171717",
            "action-primary": "#262626",
            disabled: "#505050",
            input: "#262626",
            "action-secondary": "#092f0e",
            highlight: "#2fd345",
            "action-highlight": "#2fd345",
            "action-disabled": "#171717",
          },
          stroke: {
            primary: "#262626",
            highlight: "#2fd345",
            light: "#707070",
          },
          text: {
            highlight: "#2fd345",
            primary: "#ffffff",
            secondary: "#8c8c8c",
            disabled: "#505050",
            info: "#a6a6a6",
          },
          icon: {
            primary: "#ffffff",
            secondary: "#8c8c8c",
            disabled: "#505050",
            highlight: "#2fd345",
          },
        },
      },
      borderColor: (theme) => ({
        DEFAULT: theme("colors.stroke.primary"),
        ...theme("colors"),
      }),
    },
  },
  plugins: [],
};
