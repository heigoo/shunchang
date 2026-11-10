declare module '@lynx-js/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalProps {
    /**
     * Define your global properties in this interface.
     * These types will be accessible through `lynx.__globalProps`.
     */
  }
}

declare module '@lynx-js/react' {
  export function runOnMainThread<R, Fn extends (...args: any[]) => R>(
    fn: Fn,
  ): (...args: Parameters<Fn>) => Promise<R>;
  export function runOnBackground<R, Fn extends (...args: any[]) => R>(
    fn: Fn,
  ): (...args: Parameters<Fn>) => Promise<R>;
}

// This export makes the file a module
export {};
