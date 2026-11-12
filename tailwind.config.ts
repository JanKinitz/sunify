import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sunify-Markenfarben: warmes Sonnen-Orange auf tiefem Nachtblau
        sun: {
          50: "#fff8eb",
          100: "#ffecc6",
          200: "#ffd888",
          300: "#ffbf4a",
          400: "#ffa620",
          500: "#f98307",
          600: "#dd5f02",
          700: "#b74006",
          800: "#94310c",
          900: "#7a2a0d",
        },
        ink: {
          50: "#f4f6fa",
          100: "#e6eaf2",
          200: "#cfd6e4",
          300: "#a9b5cc",
          400: "#7c8cab",
          500: "#5b6c8f",
          600: "#465475",
          700: "#39445f",
          800: "#273046",
          900: "#141b2d",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(20,27,45,.06), 0 8px 24px -8px rgba(20,27,45,.14)",
        lift: "0 2px 4px rgba(20,27,45,.08), 0 18px 40px -12px rgba(20,27,45,.28)",
      },
      keyframes: {
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "slide-in-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "slide-in-right": "slide-in-right .28s cubic-bezier(.2,.8,.2,1)",
        "slide-in-up": "slide-in-up .28s cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in .2s ease-out",
        "pop-in": "pop-in .25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
