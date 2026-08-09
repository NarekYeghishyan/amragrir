import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // `@amragrir/shared` ships a compiled ESM build, so Next can consume it
  // directly; `@amragrir/i18n` and `@amragrir/ui` publish TypeScript source and
  // have to be transpiled here rather than gaining a build step of their own.
  transpilePackages: ['@amragrir/i18n', '@amragrir/ui'],
  eslint: {
    // Linting runs as its own workspace task; a second pass inside `next build`
    // would only mean two configs to keep in step.
    ignoreDuringBuilds: true,
  },
};

export default config;
