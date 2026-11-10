import './Button.css';

export type ButtonKind = 'primary' | 'secondary' | 'tertiary';

export interface ButtonProps {
  label: string;
  kind?: ButtonKind;
  disabled?: boolean;
  block?: boolean;
  onTap?: () => void;
  className?: string;
}

export function Button(props: ButtonProps) {
  const {
    label,
    kind = 'primary',
    disabled = false,
    block = false,
    onTap,
    className,
  } = props;

  const classes = ['Btn', `Btn--${kind}`];
  if (block) classes.push('Btn--block');
  if (disabled) classes.push('Btn--disabled');
  if (className) classes.push(className);

  const handleTap = () => {
    if (disabled) return;
    onTap?.();
  };

  return (
    <view className={classes.join(' ')} bindtap={handleTap}>
      <text className="BtnLabel">{label}</text>
    </view>
  );
}
