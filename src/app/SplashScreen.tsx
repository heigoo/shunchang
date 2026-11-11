import './SplashScreen.css';

export interface SplashScreenProps {
  closing: boolean;
  safeBottom: number;
}

/** 启动页：900ms 一次翻牌，随后 160ms 交叉淡化交给首页。 */
export function SplashScreen(props: SplashScreenProps) {
  const { closing, safeBottom } = props;

  return (
    <view className={closing ? 'Splash Splash--out' : 'Splash'}>
      <view className="SplashTopRule" />

      <view className="SplashCenter">
        <view className="SplashMark">
          <view className="SplashBar SplashBar--top" />
          <view className="SplashBar SplashBar--bottom" />
        </view>
        <text className="SplashWord">顺场</text>
        <view className="SplashDivider">
          <view className="SplashDividerLit" />
        </view>
        <text className="SplashCaption">现场流程 · 按序执行</text>
      </view>

      <view
        className="SplashFoot"
        style={{ paddingBottom: safeBottom + 14 }}
      >
        <text className="SplashFootText">顺场 · 现场调度</text>
        <text className="SplashFootText">二〇二六</text>
      </view>
    </view>
  );
}
