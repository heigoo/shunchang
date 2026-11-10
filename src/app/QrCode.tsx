import { generateQrSvg } from './qr';

export interface QrCodeProps {
  value: string;
  size?: number;
}

export function QrCode(props: QrCodeProps) {
  const { value, size = 180 } = props;
  const result = generateQrSvg(value);

  return (
    <svg
      content={result.svg}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}
