/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        // Unsplash Source — used for food item photos
        protocol: 'https',
        hostname: 'source.unsplash.com',
      },
      {
        // Unsplash CDN — Unsplash Source redirects here
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

module.exports = nextConfig;
