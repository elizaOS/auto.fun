import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // not mobile first designs
    screens: {
      "2xl": { max: "1535px" },
      // => @media (max-width: 1535px) { ... }

      xl: { max: "1279px" },
      // => @media (max-width: 1279px) { ... }

      lg: { max: "1023px" },
      // => @media (max-width: 1023px) { ... }

      md: { max: "767px" },
      // => @media (max-width: 767px) { ... }

      sm: { max: "639px" },
      // => @media (max-width: 639px) { ... }

      tall: { raw: "(max-height: 800px)" },

      avg: { raw: "(max-height: 760px)" },
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        primary: ["var(--font-inter)"],
        secondary: ["var(--font-pp-mondwest)"],
      },
      keyframes: {
        shake: {
          "0%, 100%": {
            transform: "rotate(0deg) translateX(0)",
            filter: "hue-rotate(0deg) brightness(100%)",
          },
          "15%": {
            transform: "rotate(-5deg) translateX(-10px)",
            filter: "hue-rotate(180deg) brightness(150%)",
          },
          "30%": {
            transform: "rotate(5deg) translateX(10px)",
            filter: "hue-rotate(-180deg) brightness(150%)",
          },
          "45%": {
            transform: "rotate(-4deg) translateX(-8px)",
            filter: "hue-rotate(180deg) brightness(150%)",
          },
          "60%": {
            transform: "rotate(4deg) translateX(8px)",
            filter: "hue-rotate(-180deg) brightness(150%)",
          },
          "75%": {
            transform: "rotate(-2deg) translateX(-5px)",
            filter: "hue-rotate(90deg) brightness(125%)",
          },
          "85%": {
            transform: "rotate(2deg) translateX(5px)",
            filter: "hue-rotate(-90deg) brightness(125%)",
          },
        },
      },
      animation: {
        shake: "shake 0.4s cubic-bezier(.36,.07,.19,.97) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
