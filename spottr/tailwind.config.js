/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Glassmorphism palette
        'glass-bg': 'rgba(30, 41, 59, 0.7)',
        'glass-border': 'rgba(255, 255, 255, 0.1)',
        'glass-shadow': 'rgba(0, 0, 0, 0.5)',
        'accent': '#38bdf8',
        'accent-glow': 'rgba(56, 189, 248, 0.3)',
        'success': '#34d399',
      },
      backgroundImage: {
        'gradient-main': 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      },
      boxShadow: {
        'glass': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        'glass-hover': '0 30px 60px -20px rgba(0, 0, 0, 0.7)',
      },
      borderRadius: {
        'glass': '24px',
      },
      backdropBlur: {
        'glass': '12px',
      },
    },
  },
  plugins: [],
}

