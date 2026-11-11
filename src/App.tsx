import './ui/tokens.css';
import './ui/motion.css';
import './App.css';

import { useEffect, useLynxGlobalEventListener, useRef, useState } from '@lynx-js/react';

import { EditorScreen } from './app/EditorScreen';
import { FollowScreen } from './app/FollowScreen';
import { dispatchBack } from './app/backBus';
import { applyLaunchHash, importErrorMessage } from './app/importFlow';
import { ListScreen } from './app/ListScreen';
import type { AppView } from './app/nav';
import { PrintScreen } from './app/PrintScreen';
import { RuntimeScreen } from './app/RuntimeScreen';
import { SplashScreen } from './app/SplashScreen';
import { isWeb } from './app/share';
import {
  EMPTY_INSETS,
  applyBarsStyle,
  readInsetsEvent,
  requestSafeInsets,
} from './app/systemBars';
import type { SafeInsets } from './app/systemBars';
import { webSyncLocation, installMainThreadBridge } from './app/webBridge';
import type { WebLocationSnapshot } from './app/webBridge';
import {
  consumeStorageError,
  getLastView,
  getRole,
  getSheet,
  getTheme,
  hydrateStorage,
  setLastView,
  setRole,
  setThemeAsync,
} from './store/repository';
import type { AppTheme } from './store/repository';
import { Button } from './ui';

interface Route {
  view: AppView;
  sheetId?: string;
}

interface ScreenTransition {
  id: number;
  dir: 'forward' | 'back';
  from: 'light' | 'dark';
}

function viewTheme(view: AppView): 'light' | 'dark' {
  return view === 'runtime' || view === 'follow' ? 'dark' : 'light';
}

declare const NativeModules: any;

function getHostModule(): any {
  try {
    if (typeof NativeModules !== 'undefined' && NativeModules) {
      return NativeModules.ShunchangHost;
    }
  } catch {
    // Ignore.
  }
  return undefined;
}

function applyLauncherTheme(theme: AppTheme): void {
  try {
    getHostModule()?.applyLauncherTheme?.(theme);
  } catch {
    // 图标切换是增强能力，web 或旧壳上忽略。
  }
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
        <text className="PlaceholderMeta">现场调度 · 占位页</text>
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
  const [transition, setTransition] = useState<ScreenTransition | null>(null);
  const [insets, setInsets] = useState<SafeInsets>(EMPTY_INSETS);
  const [booted, setBooted] = useState(false);
  const [splashClosing, setSplashClosing] = useState(false);
  const [theme, setThemeState] = useState<AppTheme>(() => getTheme());

  const routeRef = useRef<Route>(route);
  routeRef.current = route;
  const navigateRef = useRef<(view: AppView, sheetId?: string) => void>(() => {});
  const lastBackAtRef = useRef(0);
  const transitionSeqRef = useRef(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  // 启动页：900ms 播完翻牌，再用 160ms 交叉淡化交给首页。
  useEffect(() => {
    applyBarsStyle(true);
    requestSafeInsets();
    const closeTimer = setTimeout(() => {
      setSplashClosing(true);
    }, 900);
    const doneTimer = setTimeout(() => {
      setBooted(true);
    }, 1060);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  useLynxGlobalEventListener('shunchang:insets', (value: any) => {
    const next = readInsetsEvent(value);
    if (next) {
      setInsets(next);
    }
  });

  useEffect(() => {
    if (!booted) {
      return;
    }
    applyBarsStyle(viewTheme(route.view) === 'dark');
  }, [route.view, booted]);

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

      // 存储是异步的，水合完成后才能确定主题。
      const bootTheme = getTheme();
      setThemeState(bootTheme);

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
    const previous = routeRef.current;
    if (previous.view === view && previous.sheetId === sheetId) {
      return;
    }

    const next: Route = sheetId ? { view, sheetId } : { view };
    // 进入列表是返回，其余都是进入下一层；据此决定转场方向。
    const dir: 'forward' | 'back' = view === 'list' ? 'back' : 'forward';

    transitionSeqRef.current += 1;
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
    setTransition({
      id: transitionSeqRef.current,
      dir,
      from: viewTheme(previous.view),
    });
    transitionTimerRef.current = setTimeout(() => {
      setTransition(null);
      transitionTimerRef.current = null;
    }, 320);

    setRoute(next);
    setLastView(next);
  };

  navigateRef.current = navigate;

  // 原生返回键：先让打开的浮层消费，再回退页面，最后才是双击退出。
  useLynxGlobalEventListener('shunchang:back', () => {
    if (dispatchBack()) {
      return;
    }
    if (routeRef.current.view !== 'list') {
      navigateRef.current('list');
      return;
    }

    const module = getHostModule();
    const now = Date.now();
    if (now - lastBackAtRef.current < 2000) {
      module?.exitApp?.();
      return;
    }
    lastBackAtRef.current = now;
    module?.showExitHint?.();
  });

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

  const changeTheme = (next: AppTheme) => {
    setThemeState(next);
    // 先等主题写入原生存储，再由原生切换桌面图标并从新入口重启，
    // 避免新实例读到旧主题。
    void setThemeAsync(next).then(() => {
      applyLauncherTheme(next);
    });
  };

  let content: any;

  if (route.view === 'list') {
    content = (
      <ListScreen
        key={hydrated ? 'list-ready' : 'list-boot'}
        notice={notice ?? undefined}
        safeTop={insets.top}
        safeBottom={insets.bottom}
        onOpenSheet={openSheet}
        onOpenFollow={() => {
          setRole('follower');
          navigate('follow');
        }}
        onImported={(id) => {
          navigate('follow', id);
        }}
        onCreate={openSheet}
        theme={theme}
        onThemeChange={changeTheme}
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
            safeTop={insets.top}
            safeBottom={insets.bottom}
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
            safeTop={insets.top}
            safeBottom={insets.bottom}
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
            safeTop={insets.top}
            safeBottom={insets.bottom}
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
            safeTop={insets.top}
            safeBottom={insets.bottom}
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

  const stackClasses = ['ScreenStack'];
  // 转场期间底色沿用旧页面的主题色，避免卸载瞬间露出白/黑底造成闪烁。
  const backdrop = transition ? transition.from : viewTheme(route.view);
  stackClasses.push(backdrop === 'dark' ? 'ScreenStack--dark' : 'ScreenStack--light');
  if (transition) {
    const variant = transition.id % 2 === 0 ? 'a' : 'b';
    stackClasses.push(`ScreenStack--${transition.dir}-${variant}`);
  }

  const backdropClasses = ['ScreenBackdrop'];
  if (backdrop === 'dark') {
    backdropClasses.push('ScreenBackdrop--dark');
  }
  if (theme === 'xishi') {
    backdropClasses.push('theme-xishi');
  }

  return (
    <>
      <view
        style={{ display: 'none' }}
        main-thread:ref={installMainThreadBridge}
      />
      <view className={backdropClasses.join(' ')}>
        <view className={stackClasses.join(' ')}>{content}</view>
        {!booted ? (
          <SplashScreen
            closing={splashClosing}
            safeBottom={insets.bottom}
            theme={theme}
          />
        ) : null}
      </view>
    </>
  );
}
