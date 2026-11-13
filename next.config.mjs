// Jede Veröffentlichung bekommt eine eigene Build-Kennung. Die App vergleicht sie mit /api/version
// und bietet nach einem Update das Neuladen an (components/UpdateNotice.tsx).
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || process.env.COMMIT_REF || `local-${Date.now()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
};

export default nextConfig;
