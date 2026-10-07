import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // pdfjs-dist (used for Surat Jalan PDF scanning) has an optional Node-only `require("canvas")`.
      // It is never executed in the browser, so map it to an empty module to keep the build working.
      canvas: "./src/lib/empty-module.ts",
    },
  },
};

export default nextConfig;
