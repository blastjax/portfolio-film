/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // sharp's native bindings shouldn't be bundled by webpack.
  serverExternalPackages: ['sharp'],
};

module.exports = nextConfig;
