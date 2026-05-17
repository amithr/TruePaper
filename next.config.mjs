import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = path.dirname(require.resolve("./package.json"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
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
