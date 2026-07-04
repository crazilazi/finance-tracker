import withPWAInit from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['antd', '@ant-design', 'rc-util', 'rc-pagination', 'rc-picker', 'rc-tree', 'rc-table'],
  reactStrictMode: true,
  output: "standalone",
  turbopack: {},
};

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

export default withPWA(nextConfig);
