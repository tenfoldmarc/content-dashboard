/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
    ],
  },
  // Bundle the ffmpeg-static binary into serverless functions that need it.
  // Next 14.2 still nests this under `experimental`.
  experimental: {
    outputFileTracingIncludes: {
      '/api/content/process': ['./node_modules/ffmpeg-static/**/*'],
    },
  },
};

export default nextConfig;
