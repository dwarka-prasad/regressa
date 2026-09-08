/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@regressa/db", "@regressa/shared-types"],
  experimental: { serverComponentsExternalPackages: ["postgres"] },
};
export default nextConfig;
