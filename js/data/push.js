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

/** 응답이 없으면 ms 뒤 오류 (일부 브라우저는 허용 창을 안 띄우고 영원히 기다림) */
function withTimeout(promise, ms, message, code) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(message), { code })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}
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
  const existing = await reg.pushManager.getSubscription();
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

/** 서버 없이 이 기기에서 알림이 뜨는지 확인 */
export async function showTest(title = '퀘스트 코인', body = '알림이 잘 와요 🎉') {
  const reg = await registration();
  await reg.showNotification(title, { body, icon: new URL('icons/icon-192.png', document.baseURI).href, tag: 'test' });
}

/** 지금 이 폰에서 동작 중인 알림 처리기(서비스 워커) 버전. 모르면 null */
export async function swVersion() {
  try {
    const reg = await registration();
    const sw = reg.active || navigator.serviceWorker.controller;
    if (!sw) return null;
    return await new Promise((res) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => res(null), 1500);
      ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data?.version || null); };
      sw.postMessage({ type: 'qc-version' }, [ch.port2]);
    });
  } catch {
    return null;
  }
}

/** 서버에 올라가 있는 최신 버전 (sw.js 안의 VERSION) */
export async function latestVersion() {
  try {
    const t = await (await fetch('sw.js', { cache: 'no-store' })).text();
    return (t.match(/const VERSION = '([^']+)'/) || [])[1] || null;
  } catch {
    return null;
  }
}

/** 이 폰이 마지막으로 받은 서버 알림 기록 { at, title, error, version } */
export async function lastReceived() {
  try {
    const r = await (await caches.open('qc-push-log')).match('last');
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

/** since 이후 서버 알림이 도착하길 ms 동안 기다림 → 기록 또는 null */
export function waitForPush(since, ms = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      navigator.serviceWorker.removeEventListener('message', onMsg);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(v);
    };
    const onMsg = (e) => e.data?.type === 'qc-push' && e.data.at >= since && finish(e.data);
    navigator.serviceWorker.addEventListener('message', onMsg);
    const poll = setInterval(async () => {
      const r = await lastReceived();
      if (r && r.at >= since) finish(r);
    }, 1000);
    const timer = setTimeout(() => finish(null), ms);
  });
}
