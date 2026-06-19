/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: { base: '#0A0A0F', surface: '#16161C', elevated: '#1F1F28' },
        primary: { 500: '#A855F7' },
        accent: { pink: '#EC4899', cyan: '#06B6D4' },
        flame: { from: '#F97316', to: '#EF4444' },
        xp: { gain: '#84CC16' },
        text: { primary: '#F4F4F8', muted: '#8B8B98' },
      },
      fontFamily: {
        display: ['SpaceGrotesk-Bold'],
        body: ['Inter'],
      },
    },
  },
  plugins: [],
};
