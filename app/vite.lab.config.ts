import path from "node:path"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// The style lab: one self-contained page for exploring visual directions. Build with `npm run build:lab`.
export default defineConfig({
  root: path.resolve(__dirname, "lab"),
  plugins: [viteSingleFile()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: path.resolve(__dirname, "dist-lab"), emptyOutDir: true, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
})
