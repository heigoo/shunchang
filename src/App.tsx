import './ui/tokens.css';
import './App.css';

import { useState } from '@lynx-js/react';

import { EditorScreen } from './app/EditorScreen';
import { ListScreen } from './app/ListScreen';
import type { AppView } from './app/nav';
import { RuntimeScreen } from './app/RuntimeScreen';
import {
  consumeStorageError,
  getLastView,
  getSheet,
  setLastView,
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
  const [route, setRoute] = useState<Route>(readInitialRoute);
  const [notice] = useState<string | null>(() => consumeStorageError());

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
    navigate(sheet.status === 'running' ? 'runtime' : 'editor', id);
  };

  if (route.view === 'list') {
    return (
      <ListScreen
        notice={notice ?? undefined}
        onOpenSheet={openSheet}
        onOpenFollow={() => {
          navigate('follow');
        }}
        onCreate={openSheet}
      />
    );
  }

  const sheet = route.sheetId ? getSheet(route.sheetId) : null;
  const subtitle = sheet ? sheet.name || '未命名手册' : '未选择手册';
  const back = () => {
    navigate('list');
  };

  switch (route.view) {
    case 'editor':
      return route.sheetId ? (
        <EditorScreen
          sheetId={route.sheetId}
          onBack={back}
          onStartRuntime={(id) => {
            navigate('runtime', id);
          }}
        />
      ) : (
        <PlaceholderScreen title="编排台" subtitle={subtitle} onBack={back} />
      );
    case 'runtime':
      return route.sheetId ? (
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
        <PlaceholderScreen title="执行台" subtitle={subtitle} dark onBack={back} />
      );
    case 'follow':
      return <PlaceholderScreen title="跟单" subtitle={subtitle} onBack={back} />;
    case 'print':
      return <PlaceholderScreen title="打印" subtitle={subtitle} onBack={back} />;
    default:
      return null;
  }
}
