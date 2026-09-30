import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative base so the build works under any GitHub Pages repo path.
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
