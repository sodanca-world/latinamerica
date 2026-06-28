/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sodanca: {
          nude: '#e8c5b0',
          pink: '#f6c3ce',
          dark: '#1a1a1a',
          light: '#fcfaf7',
          accent: '#c99a7c',
        },
        france: {
          blue: '#002654', // Azul marinho clássico elegante
          red: '#ed2939',  // Vermelho elegante
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
