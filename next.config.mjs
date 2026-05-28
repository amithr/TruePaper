import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = path.dirname(require.resolve("./package.json"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  // Next 16 defaults to Turbopack for `next build`; we use webpack (see package.json build script).
  turbopack: {},
  // pdfkit reads .afm font files from its own node_modules path at runtime; don't bundle it.
  serverExternalPackages: ["pdfkit"],
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.modules = [
      path.join(projectRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ];
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: path.join(projectRoot, "node_modules/tailwindcss"),
    };
    return config;
  },
};

export default nextConfig;
