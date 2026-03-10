/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        xCyan:    '#00BEFF',
        xPink:    '#FF89FF',
        xGreen:   '#C0FF7D',
        xOrange:  '#FFB340',
        xBlue:    '#3B82F6',
        xPurple:  '#A85CA9',
        xDark:    '#03070d',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        roboto:  ['Roboto', 'sans-serif'],
      },
      animation: {
        'grid-flow': 'gridFlow 20s linear infinite',
        drift:       'drift 20s infinite alternate ease-in-out',
        scan:        'scan 2s cubic-bezier(0.4,0,0.2,1) infinite alternate',
        logoBreath:  'logoBreath 3.2s ease-in-out infinite',
        logoRing:    'logoRing 3.2s ease-in-out infinite',
      },
      keyframes: {
        gridFlow: {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(40px)' },
        },
        drift: {
          '0%':   { transform: 'translate(0,0) scale(1)' },
          '50%':  { transform: 'translate(3vw,5vh) scale(1.05)' },
          '100%': { transform: 'translate(-3vw,2vh) scale(0.95)' },
        },
        scan: {
          '0%':   { top: '0%',   opacity: '0' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
        logoBreath: {
          '0%,100%': { boxShadow: '0 0 18px rgba(0,190,255,0.15)', borderColor: 'rgba(0,190,255,0.3)' },
          '50%':     { boxShadow: '0 0 38px rgba(0,190,255,0.4)',  borderColor: 'rgba(0,190,255,0.6)' },
        },
        logoRing: {
          '0%,100%': { transform: 'scale(1)',    opacity: '0.35' },
          '50%':     { transform: 'scale(1.18)', opacity: '0.08' },
        },
      },
    },
  },
  plugins: [],
}
