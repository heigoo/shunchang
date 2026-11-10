import './GlassPanel.css';

import type { ReactNode } from 'react';

const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';

export interface GlassPanelProps {
  children: ReactNode;
  radius?: number;
  padding?: number;
  className?: string;
}

export function concentricRadius(outer: number, padding: number): number {
  return Math.max(outer - padding, 0);
}

export function GlassPanel(props: GlassPanelProps) {
  const { children, radius = 22, padding = 14, className } = props;

  const classes = ['Glass'];
  if (isWeb) classes.push('Glass--web');
  if (className) classes.push(className);

  return (
    <view className={classes.join(' ')} style={{ borderRadius: `${radius}px` }}>
      <view
        className="GlassInner"
        style={{
          borderRadius: `${concentricRadius(radius, padding)}px`,
          padding: `${padding}px`,
        }}
      >
        {children}
      </view>
    </view>
  );
}
