import './ThemePanel.css';

import { getLang, setLang, useT } from '../i18n';
import type { AppTheme } from '../store/repository';

export interface ThemePanelProps {
  theme: AppTheme;
  closing?: boolean;
  onSelect(theme: AppTheme): void;
  onClose(): void;
}

interface ThemeOption {
  id: AppTheme;
  name: string;
  tagline: string;
  icon: string;
}

/**
 * 主题预览使用官方图标 SVG 的几何数据（顺场-AppIcon.svg / 顺场-喜事Icon.svg），
 * 仅补上官方圆角半径 115，避免在面板里再画一套近似色块。
 */
const ICON_DEFAULT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" rx="115" fill="#0B0B09"/>' +
  '<rect x="0" y="148" width="252" height="80" fill="#FFB020"/>' +
  '<rect x="0" y="228" width="252" height="14" fill="#A66A12"/>' +
  '<rect x="196" y="270" width="316" height="80" fill="#FFB020"/>' +
  '<rect x="196" y="350" width="316" height="14" fill="#A66A12"/>' +
  '</svg>';

const ICON_XISHI =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
  '<rect width="512" height="512" rx="115" fill="#BE2A20"/>' +
  '<rect x="0" y="148" width="252" height="80" fill="#FFB020"/>' +
  '<rect x="0" y="228" width="252" height="14" fill="#A66A12"/>' +
  '<rect x="196" y="270" width="316" height="80" fill="#FFB020"/>' +
  '<rect x="196" y="350" width="316" height="14" fill="#A66A12"/>' +
  '</svg>';

const OPTIONS: ThemeOption[] = [
  {
    id: 'default',
    name: '墨金',
    tagline: '纸面调度 · 沉稳现场',
    icon: ICON_DEFAULT,
  },
  {
    id: 'xishi',
    name: '喜事',
    tagline: '朱红喜帖 · 金线压边',
    icon: ICON_XISHI,
  },
];

export function ThemePanel(props: ThemePanelProps) {
  const { theme, closing = false, onSelect, onClose } = props;
  const t = useT();
  const lang = getLang();

  return (
    <view className={closing ? 'Overlay OverlayOut' : 'Overlay'} bindtap={onClose}>
      <view
        className={closing ? 'Panel ThemePanel PanelOut' : 'Panel ThemePanel'}
        catchtap={() => {}}
      >
        <view className="PanelHeader">
          <view className="PanelHeaderText">
            <text className="PanelTitle">{t('外观与语言')}</text>
            <text className="PanelSubtitle">
              {t('切换后自动重启并更换桌面图标')}
            </text>
          </view>
          <view className="PanelClose" bindtap={onClose}>
            <text className="PanelCloseText">{t('取消')}</text>
          </view>
        </view>

        {OPTIONS.map((option) => {
          const active = option.id === theme;
          const classes = active ? 'ThemeOption ThemeOption--active' : 'ThemeOption';
          return (
            <view
              key={option.id}
              className={classes}
              bindtap={() => {
                if (!active) {
                  onSelect(option.id);
                }
              }}
            >
              <svg
                className="ThemeSwatchIcon"
                content={option.icon}
                style={{
                  width: '46px',
                  height: '46px',
                  flexShrink: 0,
                  marginRight: '14px',
                }}
              />
              <view className="ThemeOptionMain">
                <text className="ThemeOptionName">{t(option.name)}</text>
                <text className="ThemeOptionTagline">{t(option.tagline)}</text>
              </view>
              <text
                className={
                  active
                    ? 'ThemeOptionState ThemeOptionState--active'
                    : 'ThemeOptionState'
                }
              >
                {active ? t('当前') : t('切换')}
              </text>
            </view>
          );
        })}

        <view className="ThemeLang">
          <view className="ThemeLangHead">
            <text className="ThemeLangTitle">{t('界面语言')}</text>
            <text className="ThemeLangHint">{t('语言切换即时生效')}</text>
          </view>
          <view className="ThemeLangOptions">
            <view
              className={
                lang === 'zh'
                  ? 'LangOption LangOption--active'
                  : 'LangOption'
              }
              bindtap={() => {
                setLang('zh');
              }}
            >
              <text className="LangOptionText">中文</text>
            </view>
            <view
              className={
                lang === 'en'
                  ? 'LangOption LangOption--active'
                  : 'LangOption'
              }
              bindtap={() => {
                setLang('en');
              }}
            >
              <text className="LangOptionText">English</text>
            </view>
          </view>
        </view>

        <view className="ThemeNote">
          <text className="ThemeNoteText">
            {t('桌面图标会在切换后自动更新，部分机型需几秒生效。')}
          </text>
        </view>
      </view>
    </view>
  );
}
