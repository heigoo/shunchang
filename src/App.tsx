import './ui/tokens.css';
import './App.css';

import { useEffect, useState } from '@lynx-js/react';

import { EditorScreen } from './app/EditorScreen';
import { FollowScreen } from './app/FollowScreen';
import { applyLaunchHash, importErrorMessage } from './app/importFlow';
import { ListScreen } from './app/ListScreen';
import type { AppView } from './app/nav';
import { PrintScreen } from './app/PrintScreen';
import { RuntimeScreen } from './app/RuntimeScreen';
import { isWeb } from './app/share';
import { webSyncLocation, installMainThreadBridge } from './app/webBridge';
import type { WebLocationSnapshot } from './app/webBridge';
import {
  consumeStorageError,
  getLastView,
  getRole,
  getSheet,
  hydrateStorage,
  setLastView,
  setRole,
} from './store/repository';
import { Button } from './ui';

interface Route {
  view: AppView;
  sheetId?: string;
}

function readInitialRoute(): Route {
  const last = getLastView();
  if (!last) {
    return { view: 'list' };
  }
  if (last.view === 'list') {
    return { view: 'list' };
  }
  if (last.view === 'follow') {
    return { view: 'follow' };
  }
  if (!last.sheetId || !getSheet(last.sheetId)) {
    return { view: 'list' };
  }
  return { view: last.view, sheetId: last.sheetId };
}

interface PlaceholderProps {
  title: string;
  subtitle: string;
  dark?: boolean;
  onBack: () => void;
}

function PlaceholderScreen(props: PlaceholderProps) {
  const { title, subtitle, dark = false, onBack } = props;
  const classes = dark ? 'Placeholder theme-dark' : 'Placeholder theme-light';

  return (
    <view className={classes}>
      <view className="PlaceholderHeader">
        <text className="PlaceholderBrand">顺场</text>
        <text className="PlaceholderMeta">SCHEDULE SHEET / 占位页</text>
      </view>

      <view className="PlaceholderRule" />

      <view className="PlaceholderBody">
        <text className="PlaceholderTitle">{title}</text>
        <text className="PlaceholderSubtitle">{subtitle}</text>
        <text className="PlaceholderHint">此页面将在后续任务中接入</text>
      </view>

      <view className="PlaceholderFooter">
        <Button label="返回手册列表" kind="tertiary" onTap={onBack} />
      </view>
    </view>
  );
}

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [route, setRoute] = useState<Route>({ view: 'list' });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    void (async () => {
      // 原生端存储是异步的，先把数据读入缓存；首页会以 key 重挂载读取新数据。
      await hydrateStorage();
      if (cancelled) {
        return;
      }

      if (isWeb() && typeof document === 'undefined') {
        let location: WebLocationSnapshot | null = null;
        for (let attempt = 0; attempt < 10 && !location; attempt += 1) {
          location = await Promise.race([
            webSyncLocation(),
            wait(150).then(() => null),
          ]);
          if (!location) {
            await wait(50);
          }
        }
        if (cancelled) {
          return;
        }
      }

      const boot = applyLaunchHash();
      if (boot && boot.ok) {
        setRoute({ view: 'runtime', sheetId: boot.sheetId });
        setLastView({ view: 'runtime', sheetId: boot.sheetId });
      } else {
        if (boot && !boot.ok) {
          setNotice(importErrorMessage(boot.error));
        } else {
          setNotice(consumeStorageError());
        }
        setRoute(readInitialRoute());
      }
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = (view: AppView, sheetId?: string) => {
    if (sheetId) {
      setRoute({ view, sheetId });
      setLastView({ view, sheetId });
      return;
    }
    setRoute({ view });
    setLastView({ view });
  };

  const openSheet = (id: string) => {
    const sheet = getSheet(id);
    if (!sheet) {
      return;
    }
    if (getRole() === 'follower') {
      navigate('follow', id);
      return;
    }
    navigate(sheet.status === 'running' ? 'runtime' : 'editor', id);
  };

  let content: any;

  if (route.view === 'list') {
    content = (
      <ListScreen
        key={hydrated ? 'list-ready' : 'list-boot'}
        notice={notice ?? undefined}
        onOpenSheet={openSheet}
        onOpenFollow={() => {
          setRole('follower');
          navigate('follow');
        }}
        onImported={(id) => {
          navigate('follow', id);
        }}
        onCreate={openSheet}
      />
    );
  } else {
    const sheet = route.sheetId ? getSheet(route.sheetId) : null;
    const subtitle = sheet ? sheet.name || '未命名手册' : '未选择手册';
    const back = () => {
      navigate('list');
    };

    switch (route.view) {
      case 'editor':
        content = route.sheetId ? (
          <EditorScreen
            sheetId={route.sheetId}
            onBack={back}
            onStartRuntime={(id) => {
              navigate('runtime', id);
            }}
            onPrint={(id) => {
              navigate('print', id);
            }}
          />
        ) : (
          <PlaceholderScreen title="编排台" subtitle={subtitle} onBack={back} />
        );
        break;
      case 'runtime':
        content = route.sheetId ? (
          <RuntimeScreen
            sheetId={route.sheetId}
            onBack={() => {
              navigate('list');
            }}
            onPrint={(id) => {
              navigate('print', id);
            }}
          />
        ) : (
          <PlaceholderScreen
            title="执行台"
            subtitle={subtitle}
            dark
            onBack={back}
          />
        );
        break;
      case 'follow':
        content = (
          <FollowScreen
            sheetId={route.sheetId}
            onBack={() => {
              navigate('list');
            }}
          />
        );
        break;
      case 'print':
        content = route.sheetId ? (
          <PrintScreen
            sheetId={route.sheetId}
            onBack={() => {
              navigate('list');
            }}
          />
        ) : (
          <PlaceholderScreen title="打印" subtitle={subtitle} onBack={back} />
        );
        break;
      default:
        content = null;
    }
  }

  return (
    <>
      <view
        style={{ display: 'none' }}
        main-thread:ref={installMainThreadBridge}
      />
      {content}
    </>
  );
}
