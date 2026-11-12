import './SplashScreen.css';

import { useT } from '../i18n';
import type { AppTheme } from '../store/repository';

export interface SplashScreenProps {
  closing: boolean;
  safeBottom: number;
  theme?: AppTheme;
}

/** 启动页：900ms 一次翻牌，随后 160ms 交叉淡化交给首页。 */
export function SplashScreen(props: SplashScreenProps) {
  const { closing, safeBottom, theme = 'default' } = props;
  const t = useT();
  const xishi = theme === 'xishi';

  const classes = ['Splash'];
  if (xishi) classes.push('Splash--xishi');
  if (closing) classes.push('Splash--out');

  return (
    <view className={classes.join(' ')}>
      <view className="SplashTopRule" />

      <view className="SplashCenter">
        <view className="SplashMark">
          <view className="SplashBar SplashBar--top" />
          <view className="SplashBar SplashBar--bottom" />
        </view>
        <text className="SplashWord">{t('顺场')}</text>
        <view className="SplashDivider">
          <view className="SplashDividerLit" />
        </view>
        <text className="SplashCaption">
          {xishi ? t('婚礼当天 · 现场执行') : t('现场流程 · 按序执行')}
        </text>
      </view>

      {xishi ? (
        <text
          className="SplashSeal"
          style={{ bottom: safeBottom + 64 }}
        >
          囍
        </text>
      ) : null}

      <view className="SplashFoot" style={{ paddingBottom: safeBottom + 14 }}>
        <text className="SplashFootText">
          {xishi ? t('顺场 · 婚礼现场') : t('顺场 · 现场调度')}
        </text>
        <text className="SplashFootText">
          {xishi ? t('第一版 / 二〇二六') : t('二〇二六')}
        </text>
      </view>
    </view>
  );
}
