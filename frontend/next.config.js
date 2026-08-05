/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        // TheMealDB food photos
        protocol: 'https',
        hostname: 'www.themealdb.com',
      },
      {
        // Foodish API food photos
        protocol: 'https',
        hostname: 'foodish-api.com',
      },
      {
        // Wikimedia Commons — Ethiopian dish photos
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        // UI Avatars — coloured letter fallback
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
  },
  // Turbopack config — set root to workspace so Next infers correct root during builds
  turbopack: {
    root: '.'
  },
};

module.exports = nextConfig;
