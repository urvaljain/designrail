import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import colors from "tailwindcss/colors";

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      brand: { DEFAULT: "#2563eb", 50: "#eff6ff" },
      primary: "hsl(var(--primary))",
      accent: colors.amber,
    },
    extend: {
      spacing: { "18": "4.5rem", gutter: "1.5rem" },
      fontFamily: { sans: ["Inter", ...defaultTheme.fontFamily.sans], display: "Poppins, sans-serif" },
      fontSize: { body: ["1rem", { lineHeight: "1.5rem" }] },
      borderRadius: { DEFAULT: "0.5rem" },
      boxShadow: ({ theme }: { theme: (k: string) => string }) => ({ card: theme("x") }),
      screens: { tablet: "640px", wide: { min: "1280px" } },
      zIndex: { modal: "50" },
    },
  },
  plugins: [require("@tailwindcss/forms")],
} satisfies Config;

export default config;
