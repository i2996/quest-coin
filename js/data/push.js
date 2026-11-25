// 웹 푸시 구독 (브라우저 API). 서버 저장은 api.savePush / api.deletePush 가 담당.
import * as config from '../config.js';

const vapidKey = () => String(config.VAPID_PUBLIC_KEY || '').trim();
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyToBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** 서비스 워커 준비 (등록 안 됐으면 등록). 8초 넘으면 sw_timeout */
async function registration() {
  return withTimeout((async () => {
    if (!navigator.serviceWorker.controller) await navigator.serviceWorker.register('sw.js').catch(() => {});
    return navigator.serviceWorker.ready;
  })(), 8000, '앱 준비(알림 처리기)가 끝나지 않았어요. 앱을 완전히 닫았다가 다시 열어주세요.', 'sw_timeout');
}

export async function current() {
  if (!supported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** 응답이 없으면 ms 뒤 오류 (일부 브라우저는 허용 창을 안 띄우고 영원히 기다림) */
function withTimeout(promise, ms, message, code) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(message), { code })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}
export { withTimeout };
export const TIMEOUTS = { permission: 25000, subscribe: 15000 };

/** 알림 허용 묻기 (응답 없으면 perm_timeout, 거절이면 denied 오류) */
export async function askPermission() {
  if (Notification.permission === 'granted') return;
  const r = await withTimeout(Promise.resolve(Notification.requestPermission()), TIMEOUTS.permission,
    '알림 허용 창이 뜨지 않았어요.', 'perm_timeout');
  if (r !== 'granted') throw Object.assign(new Error('알림이 허용되지 않았어요.'), { code: 'denied' });
}

/** 알림 허용을 묻고 구독 (이미 있으면 그대로). 반환: PushSubscription */
export async function subscribe({ ask = true } = {}) {
  if (!supported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (ask) await askPermission();
  const reg = await registration();
  const existing = await withTimeout(reg.pushManager.getSubscription(), 8000, '이 폰의 알림 구독 정보를 읽지 못했어요.', 'getsub_timeout');
  if (existing) return existing;
  return withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey()) }),
    TIMEOUTS.subscribe, '알림 서버 연결(구독)이 응답하지 않아요.', 'sub_timeout');
}

export async function unsubscribe() {
  const sub = await current();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return endpoint;
}
