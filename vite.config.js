import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import path from "node:path"

export default defineConfig({
  plugins: [
    react(),

    tailwindcss(),

    VitePWA({
      registerType: "autoUpdate",

      includeAssets: [
        "apple-touch-icon.png",
      ],

      manifest: {
        name: "Evidence cestovného",
        short_name: "Cestovné",

        description:
          "Evidence dojíždění a cestovného",

        theme_color: "#2563eb",
        background_color: "#f8fafc",

        display: "standalone",
        start_url: "/",
        scope: "/",

        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(
        import.meta.dirname,
        "./src"
      ),
    },
  },
})