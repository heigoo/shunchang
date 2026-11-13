import './ImportPanel.css';

import { useLynxGlobalEventListener, useState } from '@lynx-js/react';

import { setRole } from '../store/repository';
import { useT } from '../i18n';
import { Button } from '../ui';
import type { ImportResult } from './importFlow';
import {
  importErrorMessage,
  importFileText,
  importPayloadText,
  importShortCodeText,
} from './importFlow';
import { canUseNativeFiles, pickJsonFile } from './share';

export interface ImportPanelProps {
  closing?: boolean;
  safeTop?: number;
  onClose(): void;
  onImported(sheetId: string): void;
}

function inputValue(event: any): string {
  const detail = event && event.detail ? event.detail : null;
  return detail && typeof detail.value === 'string' ? detail.value : '';
}

function imeBottomOf(payload: any): number {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const data =
    first && typeof first === 'object' && first.data ? first.data : first;
  const bottom = data && typeof data.bottom === 'number' ? data.bottom : 0;
  return Math.max(0, Math.round(bottom));
}

function extractPayload(text: string): string {
  const trimmed = text.trim();
  const hashIndex = trimmed.indexOf('#d=');
  if (hashIndex >= 0) {
    return trimmed.slice(hashIndex + 3);
  }
  const schemeIndex = trimmed.indexOf('SC1:');
  if (schemeIndex >= 0) {
    return trimmed.slice(schemeIndex + 4);
  }
  return trimmed;
}

export function ImportPanel(props: ImportPanelProps) {
  const { closing = false, safeTop = 0, onClose, onImported } = props;
  const t = useT();

  const [linkText, setLinkText] = useState('');
  const [codeText, setCodeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imeBottom, setImeBottom] = useState(0);

  const canPickFile = canUseNativeFiles();

  useLynxGlobalEventListener('shunchang:ime', (value: any) => {
    setImeBottom(imeBottomOf(value));
  });

  const handleResult = (result: ImportResult) => {
    if (!result.ok) {
      setError(importErrorMessage(result.error));
      return;
    }
    setError(null);
    setRole('follower');
    onClose();
    onImported(result.sheetId);
  };

  const handleLink = () => {
    handleResult(importPayloadText(extractPayload(linkText)));
  };

  const handleCode = () => {
    handleResult(importShortCodeText(codeText));
  };

  const handleFile = () => {
    pickJsonFile((text) => {
      handleResult(importFileText(text));
    });
  };

  return (
    <view
      className={closing ? 'ImportOverlay OverlayOut' : 'ImportOverlay'}
      style={{ paddingTop: 24 + safeTop, paddingBottom: 24 + imeBottom }}
    >
      <scroll-view className="ImportScroll" scroll-orientation="vertical">
        <view
          className="ImportStage"
          bindtap={() => {
            onClose();
          }}
        >
          <view
            className={
              closing
                ? 'ImportPanel PanelOut theme-light'
                : 'ImportPanel theme-light'
            }
            catchtap={() => {}}
          >
            <view className="ImportHead">
              <view className="ImportHeadText">
                <text className="ImportTitle">{t('载入手册')}</text>
                <text className="ImportSubtitle">
                  {t('用系统相机扫码会自动打开跟随页；也可粘贴链接、输入短码或选择文件')}
                </text>
              </view>
              <view className="ImportClose" bindtap={onClose}>
                <text className="ImportCloseText">{t('取消')}</text>
              </view>
            </view>

            {error ? (
              <view className="ImportError">
                <text className="ImportErrorText">{error}</text>
              </view>
            ) : null}

            <view className="ImportSection">
              <view className="ImportSectionHead">
                <text className="ImportStepNo">01</text>
                <text className="ImportLabel">{t('分享链接 / 备份内容')}</text>
              </view>
              <textarea
                className="ImportTextarea"
                placeholder={t('粘贴分享链接或备份内容')}
                maxlength={4000}
                bindinput={(event) => {
                  setLinkText(inputValue(event));
                }}
              />
              <view className="ImportAction">
                <Button
                  label={t('载入链接')}
                  block
                  disabled={linkText.trim().length === 0}
                  onTap={handleLink}
                />
              </view>
            </view>

            <view className="ImportSection">
              <view className="ImportSectionHead">
                <text className="ImportStepNo">02</text>
                <text className="ImportLabel">{t('短码')}</text>
              </view>
              <input
                className="ImportInput"
                placeholder={t('输入短码')}
                maxlength={11}
                bindinput={(event) => {
                  setCodeText(inputValue(event));
                }}
              />
              <view className="ImportAction">
                <Button
                  label={t('用短码载入')}
                  kind="secondary"
                  block
                  disabled={codeText.trim().length === 0}
                  onTap={handleCode}
                />
              </view>
            </view>

            {canPickFile ? (
              <view className="ImportSection">
                <view className="ImportSectionHead">
                  <text className="ImportStepNo">03</text>
                  <text className="ImportLabel">{t('文件')}</text>
                </view>
                <view className="ImportAction">
                  <Button
                    label={t('选择文件')}
                    kind="tertiary"
                    block
                    onTap={handleFile}
                  />
                </view>
              </view>
            ) : null}
          </view>
        </view>
      </scroll-view>
    </view>
  );
}
