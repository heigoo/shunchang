import { storage } from '../store/storage';

const DEVICE_ID_KEY = 'shunchang.deviceId';
const DEVICE_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 本机设备短标识，首次使用时生成并落盘，形如 `D-7K2M`。 */
export function getDeviceId(): string {
  try {
    const saved = storage.get(DEVICE_ID_KEY);
    if (saved && saved.length > 0) {
      return saved;
    }
  } catch {
    // 读取失败时继续生成。
  }

  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += DEVICE_ID_ALPHABET[
      Math.floor(Math.random() * DEVICE_ID_ALPHABET.length)
    ];
  }
  const id = `D-${suffix}`;
  try {
    storage.set(DEVICE_ID_KEY, id);
  } catch {
    // 持久化失败时仍返回本次会话可用的标识。
  }
  return id;
}
