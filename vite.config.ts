import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Sign clips are up to 600 KB each. Vite's default inline limit would still
// base64 a small poster or a stub into the Signs page chunk. Keep that folder
// as real files so a dropped clip is fetched only when the sheet plays it.
function assetsInlineLimit(filePath: string): boolean | undefined {
  if (filePath.replaceAll("\\", "/").includes("/src/assets/signs/video/")) return false;
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    assetsInlineLimit,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
          icons: ["lucide-react"],
          dates: ["date-fns"],
        },
      },
    },
  },
}));
