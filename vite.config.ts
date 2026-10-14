import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // fixed port: fail loudly instead of drifting to another port a tool won't find
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
})

export default config
