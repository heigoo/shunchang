import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin';
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

// 免安装跟随页的完整地址。默认使用 Trae 部署的公开跟随页
// （Site ID: 37jgbn03wc2xhkefws2）；可用 PUBLIC_FOLLOW_URL 覆盖。
// 未配置且无默认值时，原生端不生成在线跟随二维码，Web 端回退到当前页面。
const DEFAULT_FOLLOW_URL = 'https://37jgbn03wc2xhkefws2.traesite.cn/';
const publicFollowUrl =
  (process.env.PUBLIC_FOLLOW_URL ?? '').trim() || DEFAULT_FOLLOW_URL;

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
