import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // So o "casco" do app (HTML/JS/CSS) e cacheado. Nenhuma resposta de
      // /api fica em cache: dados de ocorrencia/familia sao sensiveis e
      // precisam estar sempre atualizados (a checagem de pulseira, por
      // exemplo, nunca pode responder com um "existe" desatualizado).
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Lista de praias (fallback sem geolocalizacao): dado publico,
            // pouco sensivel a mudanca, ajuda o fluxo a funcionar mesmo
            // com internet instavel na praia.
            urlPattern: ({ url }) => url.pathname === "/api/public/beaches",
            handler: "NetworkFirst",
            options: {
              cacheName: "public-beaches",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      manifest: {
        name: "Anjos da Praia",
        short_name: "Anjos da Praia",
        description: "Apoio na localização de crianças perdidas nas praias.",
        theme_color: "#134e6d",
        background_color: "#eef7fb",
        display: "standalone",
        start_url: "/encontrei",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
