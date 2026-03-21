import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-only proxy so GET/POST to the Apps Script web app are same-origin (avoids browser CORS on script.google.com).
 * Set VITE_GAS_DEV_PROXY=false in .env to disable and call the script URL directly.
 */
function gasWebAppProxyFromEnv(mode, cwd) {
  const env = loadEnv(mode, cwd, "");
  const scriptUrl = (
    env.NEXT_PUBLIC_RECORDING_UPLOAD_URL ||
    env.VITE_RECORDING_UPLOAD_URL ||
    env.VITE_TEST_SUBMISSION_URL ||
    ""
  ).toString();
  const m = scriptUrl.match(/\/macros\/s\/([^/]+)/);
  const id = m ? m[1] : null;
  if (!id || env.VITE_GAS_DEV_PROXY === "false") return {};
  return {
    "/__gas/exec": {
      target: "https://script.google.com",
      changeOrigin: true,
      secure: true,
      rewrite: (path) => {
        const q = path.indexOf("?");
        const qs = q >= 0 ? path.slice(q) : "";
        return `/macros/s/${id}/exec${qs}`;
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    proxy: gasWebAppProxyFromEnv(mode, process.cwd()),
  },
}));
