function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** 计划时间是本地墙钟分钟，倒计时按本机零点计算。 */
export function secondsUntil(targetMin: number, nowMs: number): number {
  const now = new Date(nowMs);
  const nowSec = Math.floor(nowMs / 1000);
  const dayStart = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000,
  );
  let best: number | null = null;

  for (const shift of [-1, 0, 1]) {
    const targetSec = dayStart + shift * 86400 + targetMin * 60;
    const diff = targetSec - nowSec;
    if (best === null || Math.abs(diff) < Math.abs(best)) {
      best = diff;
    }
  }

  return Math.round(best ?? 0);
}

export function formatCountdown(seconds: number): {
  sign: 'left' | 'over';
  text: string;
} {
  const over = seconds < 0;
  const total = Math.abs(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const text =
    total >= 6000
      ? `${pad2(hours)}:${pad2(minutes)}:${pad2(rest)}`
      : `${pad2(minutes)}:${pad2(rest)}`;
  return { sign: over ? 'over' : 'left', text };
}
