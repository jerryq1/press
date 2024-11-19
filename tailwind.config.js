/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class", // 启用 class 方式的暗黑模式
  content: [
    './docs/**/*.{md,vue,ts,js}',
    './docs/.vitepress/theme/**/*.{md,vue}'
  ],
  theme: {
    extend: {
      colors: {
        "dark-bg": "#1a202c",
        "dark-text": "#a0aec0",
        "dark-border": "#2d3748",
      },
    },
  },
  plugins: [],
}
