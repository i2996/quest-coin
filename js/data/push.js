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

/** 서비스 워커 준비 (등록 안 됐으면 등록) */
async function registration() {
  if (!navigator.serviceWorker.controller) await navigator.serviceWorker.register('sw.js').catch(() => {});
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('앱 준비가 덜 됐어요. 새로고침한 뒤 다시 눌러주세요.')), 6000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function current() {
  if (!supported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** 알림 허용을 묻고 구독 (이미 있으면 그대로). 반환: PushSubscription */
export async function subscribe({ ask = true } = {}) {
  if (!supported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (ask && Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('알림이 허용되지 않았어요. 브라우저 설정에서 이 사이트 알림을 허용해주세요.');
  }
  const reg = await registration();
  return (await reg.pushManager.getSubscription()) ||
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey()) });
}

export async function unsubscribe() {
  const sub = await current();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return endpoint;
}

/** 서버 없이 이 기기에서 알림이 뜨는지 확인 */
export async function showTest(title = '퀘스트 코인', body = '알림이 잘 와요 🎉') {
  const reg = await registration();
  await reg.showNotification(title, { body, icon: new URL('icons/icon-192.png', document.baseURI).href, tag: 'test' });
}
