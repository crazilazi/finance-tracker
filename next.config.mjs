/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['antd', '@ant-design', 'rc-util', 'rc-pagination', 'rc-picker', 'rc-tree', 'rc-table'],
  reactStrictMode: true,
};

export default nextConfig;
