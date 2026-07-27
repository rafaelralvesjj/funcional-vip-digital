const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  experimental: {
    serverComponentsExternalPackages: ["@vercel/blob", "undici"],
  },

  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        undici: path.resolve(__dirname, "lib/undici-browser.js"),
      };
    }

    return config;
  },
};

module.exports = nextConfig;
