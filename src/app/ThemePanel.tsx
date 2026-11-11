import './ThemePanel.css';

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
  bg: string;
  bar: string;
  rule: string;
}

const OPTIONS: ThemeOption[] = [
  {
    id: 'default',
    name: '墨金',
    tagline: '纸面调度 · 沉稳现场',
    bg: '#0B0B09',
    bar: '#FFB020',
    rule: '#2A2A22',
  },
  {
    id: 'xishi',
    name: '喜事',
    tagline: '朱红喜帖 · 金线压边',
    bg: '#BE2A20',
    bar: '#FFB020',
    rule: '#8A2416',
  },
];

export function ThemePanel(props: ThemePanelProps) {
  const { theme, closing = false, onSelect, onClose } = props;

  return (
    <view className={closing ? 'Overlay OverlayOut' : 'Overlay'} bindtap={onClose}>
      <view
        className={closing ? 'Panel ThemePanel PanelOut' : 'Panel ThemePanel'}
        catchtap={() => {}}
      >
        <view className="PanelHeader">
          <view className="PanelHeaderText">
            <text className="PanelTitle">外观主题</text>
            <text className="PanelSubtitle">切换后桌面图标同步更换</text>
          </view>
          <view className="PanelClose" bindtap={onClose}>
            <text className="PanelCloseText">取消</text>
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
              <view
                className="ThemeSwatch"
                style={{ backgroundColor: option.bg, borderColor: option.rule }}
              >
                <view
                  className="ThemeSwatchBar"
                  style={{ backgroundColor: option.bar }}
                />
              </view>
              <view className="ThemeOptionMain">
                <text className="ThemeOptionName">{option.name}</text>
                <text className="ThemeOptionTagline">{option.tagline}</text>
              </view>
              <text
                className={
                  active
                    ? 'ThemeOptionState ThemeOptionState--active'
                    : 'ThemeOptionState'
                }
              >
                {active ? '当前' : '切换'}
              </text>
            </view>
          );
        })}

        <view className="ThemeNote">
          <text className="ThemeNoteText">
            桌面图标会在切换后自动更新，部分机型需几秒生效。
          </text>
        </view>
      </view>
    </view>
  );
}
