import './ThemePanel.css';

import { getLang, setLang, useT } from '../i18n';
import { isDesktopRuntime } from '../platform/desktop';
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
}

const OPTIONS: ThemeOption[] = [
  {
    id: 'default',
    name: '墨金',
    tagline: '纸面调度 · 沉稳',
  },
  {
    id: 'xishi',
    name: '喜事',
    tagline: '朱红喜帖 · 金边',
  },
];

export function ThemePanel(props: ThemePanelProps) {
  const { theme, closing = false, onSelect, onClose } = props;
  const t = useT();
  const lang = getLang();
  const desktop = isDesktopRuntime();

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
              {desktop
                ? t('切换仅影响界面配色，应用不会重启')
                : t('切换后自动重启并更换桌面图标')}
            </text>
          </view>
          <view className="PanelClose" bindtap={onClose}>
            <text className="PanelCloseText">{t('取消')}</text>
          </view>
        </view>

        <view className="ThemeSwatchGrid">
          {OPTIONS.map((option) => {
            const active = option.id === theme;
            const classes = ['ThemeSwatch', `ThemeSwatch--${option.id}`];
            if (active) {
              classes.push('ThemeSwatch--active');
            }
            return (
              <view
                key={option.id}
                className={classes.join(' ')}
                bindtap={() => {
                  if (!active) {
                    onSelect(option.id);
                  }
                }}
              >
                <view className={`ThemePreview ThemePreview--${option.id}`}>
                  <view className="ThemePreviewTop">
                    <text className="ThemePreviewNo">001</text>
                    <text className="ThemePreviewTime">18:00</text>
                  </view>
                  <text className="ThemePreviewName">{t('仪式入场')}</text>
                  <text className="ThemePreviewOwner">{t('司仪')}</text>
                  <view className="ThemePreviewStamp">
                    <text className="ThemePreviewStampText">
                      {`${t('锁定')} 18:00`}
                    </text>
                  </view>
                </view>
                <view className="ThemeSwatchInfo">
                  <text className="ThemeSwatchName">{t(option.name)}</text>
                  <text className="ThemeSwatchTagline">{t(option.tagline)}</text>
                  <text
                    className={
                      active
                        ? 'ThemeSwatchState ThemeSwatchState--active'
                        : 'ThemeSwatchState'
                    }
                  >
                    {active ? t('当前') : t('切换')}
                  </text>
                </view>
              </view>
            );
          })}
        </view>

        <view className="ThemeLang">
          <view className="ThemeLangHead">
            <text className="ThemeLangTitle">{t('界面语言')}</text>
            <text className="ThemeLangHint">{t('语言切换即时生效')}</text>
          </view>
          <view
            className={
              desktop
                ? 'ThemeLangOptions'
                : 'ThemeLangOptions ThemeLangOptions--stacked'
            }
          >
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
              <text
                className={
                  lang === 'zh'
                    ? 'LangOptionText LangOptionText--active'
                    : 'LangOptionText'
                }
              >
                中文
              </text>
            </view>
            {desktop ? <text className="LangDivider">/</text> : null}
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
              <text
                className={
                  lang === 'en'
                    ? 'LangOptionText LangOptionText--active'
                    : 'LangOptionText'
                }
              >
                English
              </text>
            </view>
          </view>
        </view>

        <view className="ThemeNote">
          <text className="ThemeNoteText">
            {desktop
              ? t('桌面图标在安装包中固定，运行时不更换')
              : t('桌面图标会在切换后自动更新，部分机型需几秒生效。')}
          </text>
        </view>
      </view>
    </view>
  );
}
