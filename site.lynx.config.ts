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
  },
  server: {
    port: 3100,
  },
  plugins: [pluginReactLynx()],
});
