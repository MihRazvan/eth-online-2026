import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4174, host: "127.0.0.1", fs: { allow: ["../.."] },
    proxy: { "/api/listings": process.env.FEESTRIP_LISTINGS_ORIGIN ?? "http://127.0.0.1:8791", "/api/operations": process.env.FEESTRIP_OPERATIONS_ORIGIN ?? "http://127.0.0.1:8789", "/api/analysis": "http://127.0.0.1:8787", "/api/recovery": process.env.FEESTRIP_RECOVERY_ORIGIN ?? "http://127.0.0.1:8788" },
  },
});
