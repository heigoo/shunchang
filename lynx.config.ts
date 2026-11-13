import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

// 免安装跟随页的完整地址，例如 https://example.com/follow.html。
// 未配置时原生端不生成在线跟随二维码，Web 端回退到当前页面。
const publicFollowUrl = (process.env.PUBLIC_FOLLOW_URL ?? '').trim();

export default defineConfig({
  environments: {
    lynx: {},
    web: {},
  },
  source: {
    define: {
      'process.env.PUBLIC_FOLLOW_URL': JSON.stringify(publicFollowUrl),
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        // We use `?fullscreen=true` to open the page in LynxExplorer in full screen mode
        return `${url}?fullscreen=true`;
      },
    }),
    pluginReactLynx(),
    pluginTypeCheck(),
  ],
});
