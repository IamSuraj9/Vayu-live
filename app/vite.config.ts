import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// `npm run build` makes normal, cacheable files for the website.
// `npm run build:single` makes one self-contained HTML file (for previews and artifacts).
const single = !!process.env.SINGLE

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: single
    ? { outDir: "dist-single", assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 }
    : { chunkSizeWarningLimit: 1500 },
})
