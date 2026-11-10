import './Badge.css';

export type BadgeKind = 'reverse' | 'outline' | 'stamp';

export interface BadgeProps {
  label: string;
  kind?: BadgeKind;
  className?: string;
}

export function Badge(props: BadgeProps) {
  const { label, kind = 'outline', className } = props;

  const classes = ['Badge', `Badge--${kind}`];
  if (className) classes.push(className);

  const text = kind === 'stamp' ? `[${label}]` : label;

  return (
    <view className={classes.join(' ')}>
      <text className="BadgeText">{text}</text>
    </view>
  );
}
