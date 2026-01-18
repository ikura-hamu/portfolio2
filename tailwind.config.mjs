/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans JP"', "sans-serif"],
      },
      spacing: {
        s1: "4px",
        s2: "8px",
        s3: "12px",
        s4: "16px",
        s5: "24px",
        s6: "32px",
        s7: "48px",
      },
    },
  },
  plugins: [],
};
