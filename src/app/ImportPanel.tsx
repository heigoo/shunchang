import './ImportPanel.css';

import { useState } from '@lynx-js/react';

import { setRole } from '../store/repository';
import { Button } from '../ui';
import type { ImportResult } from './importFlow';
import {
  importErrorMessage,
  importFileText,
  importPayloadText,
  importShortCodeText,
} from './importFlow';
import { isWeb, pickJsonFile } from './share';

export interface ImportPanelProps {
  closing?: boolean;
  onClose(): void;
  onImported(sheetId: string): void;
}

function inputValue(event: any): string {
  const detail = event && event.detail ? event.detail : null;
  return detail && typeof detail.value === 'string' ? detail.value : '';
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
  const { closing = false, onClose, onImported } = props;

  const [linkText, setLinkText] = useState('');
  const [codeText, setCodeText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const web = isWeb();

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
      bindtap={() => {
        onClose();
      }}
    >
      <view
        className={closing ? 'ImportPanel PanelOut' : 'ImportPanel'}
        catchtap={() => {}}
      >
        <view className="ImportHead">
          <view className="ImportHeadText">
            <text className="ImportTitle">载入手册</text>
            <text className="ImportSubtitle">
              扫码打开会自动载入；也可粘贴链接或输入六位短码
            </text>
          </view>
          <view className="ImportClose" bindtap={onClose}>
            <text className="ImportCloseText">取消</text>
          </view>
        </view>

        {error ? (
          <view className="ImportError">
            <text className="ImportErrorText">{error}</text>
          </view>
        ) : null}

        <view className="ImportSection">
          <text className="ImportLabel">链接 / 载荷</text>
          <textarea
            className="ImportTextarea"
            placeholder="粘贴分享链接或载荷"
            maxlength={4000}
            bindinput={(event) => {
              setLinkText(inputValue(event));
            }}
          />
          <view className="ImportAction">
            <Button label="载入链接" block onTap={handleLink} />
          </view>
        </view>

        <view className="ImportSection">
          <text className="ImportLabel">六位短码</text>
          <input
            className="ImportInput"
            placeholder="输入六位短码"
            maxlength={8}
            bindinput={(event) => {
              setCodeText(inputValue(event));
            }}
          />
          <view className="ImportAction">
            <Button
              label="同步状态"
              kind="secondary"
              block
              onTap={handleCode}
            />
          </view>
        </view>

        {web ? (
          <view className="ImportSection">
            <text className="ImportLabel">文件</text>
            <view className="ImportAction">
              <Button
                label="选择文件"
                kind="tertiary"
                block
                onTap={handleFile}
              />
            </view>
          </view>
        ) : null}
      </view>
    </view>
  );
}
