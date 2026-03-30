const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@post-recovery/shared'],
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'tesseract.js'],
  experimental: {
    externalDir: true,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
