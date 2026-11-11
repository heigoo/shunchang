type BackHandler = () => boolean;

const handlers = new Set<BackHandler>();

/** 注册页面级返回处理；返回 true 表示已消费本次返回。 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** 依次询问已打开的浮层是否消费返回键。 */
export function dispatchBack(): boolean {
  for (const handler of Array.from(handlers)) {
    try {
      if (handler()) {
        return true;
      }
    } catch {
      // 单个处理器异常不应阻断返回流程。
    }
  }
  return false;
}
