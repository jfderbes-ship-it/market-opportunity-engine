import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { createMarketApiHandler } from "./server/marketApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "local-market-api",
        configureServer(server) {
          server.middlewares.use(createMarketApiHandler(env));
        }
      }
    ],
    server: {
      port: 5173,
      strictPort: false
    }
  };
});
