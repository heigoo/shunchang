import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';

export default defineConfig({
  environments: {
    lynx: {},
    web: {},
  },
  source: {
    entry: './site/index.tsx',
  },
  output: {
    distPath: { root: 'dist-site' },
    // 官网图片等静态资源前缀：根域名部署用 /，子路径部署（如 GitHub Pages）用 /<repo>/。
    assetPrefix: process.env.PUBLIC_ASSET_PREFIX || '/',
  },
  server: {
    port: 3100,
  },
  plugins: [pluginReactLynx()],
});
