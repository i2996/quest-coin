// 알림 구독. 서버 저장은 api.savePush / api.deletePush 가 담당.
//  - 브라우저: 웹 푸시 (서비스 워커)
//  - 안드로이드 앱(퀘스트코인 앱 안): 안드로이드 진짜 알림(FCM). 구독 주소는 'fcm:<토큰>' 으로 저장
import * as config from '../config.js';

const vapidKey = () => String(config.VAPID_PUBLIC_KEY || '').trim();

/* ---------- 안드로이드 앱 ---------- */
const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);
/** 퀘스트코인 안드로이드 앱 안에서 열렸나 */
export const isNative = () => !!(cap()?.isNativePlatform?.() && cap()?.nativePromise);
const PN = 'PushNotifications';
const callPN = (method, opts = {}) => cap().nativePromise(PN, method, opts);
let nativePerm = 'default';
let nativeEndpoint = null;
const mapPerm = (r) => (r?.receive === 'granted' ? 'granted' : r?.receive === 'denied' ? 'denied' : 'default');
export async function refreshNativePermission() {
  if (!isNative()) return nativePerm;
  try {
    nativePerm = mapPerm(await callPN('checkPermissions'));
  } catch { /* 플러그인 없음 */ }
  return nativePerm;
}
/** 앱이 켜져 있을 때 온 알림 → window 'qc:push' 이벤트 (화면에 토스트 + 새로 불러오기) */
export function initNative() {
  if (!isNative()) return;
  refreshNativePermission().then(() => window.dispatchEvent(new Event('qc:push-perm')));
  cap().addListener(PN, 'pushNotificationReceived', (n) => window.dispatchEvent(new CustomEvent('qc:push', { detail: n || {} })));
}
/** 안드로이드 알림 토큰 받기 → 'fcm:<토큰>' 구독처럼 돌려줌 */
async function nativeSubscribe() {
  // 알림 채널 (중요도 높음: 화면 위에 뜨고 소리)
  await callPN('createChannel', { id: 'quest', name: '퀘스트코인 알림', description: '심부름·돌발 미션·코인 소식', importance: 5, visibility: 1, vibration: true }).catch(() => {});
  const token = await withTimeout(new Promise((resolve, reject) => {
    const ok = cap().addListener(PN, 'registration', (t) => { ok.remove(); bad.remove(); resolve(t?.value); });
    const bad = cap().addListener(PN, 'registrationError', (e) => { ok.remove(); bad.remove(); reject(new Error('알림 등록 실패: ' + (e?.error || '알 수 없음'))); });
    callPN('register').catch(reject);
  }), 20000, '알림 서버 연결이 응답하지 않아요.', 'sub_timeout');
  if (!token) throw new Error('알림 토큰을 받지 못했어요.');
  nativeEndpoint = 'fcm:' + token;
  return { endpoint: nativeEndpoint, toJSON: () => ({ endpoint: nativeEndpoint, keys: { p256dh: '-', auth: '-' } }) };
}

/* ---------- 공통 ---------- */
export const supported = () => isNative() || ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
export const permission = () => (isNative() ? nativePerm : supported() ? Notification.permission : 'unsupported');
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
  if (isNative()) return nativeEndpoint ? { endpoint: nativeEndpoint } : null;
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
  if (isNative()) {
    if ((await refreshNativePermission()) === 'granted') return;
    nativePerm = mapPerm(await withTimeout(callPN('requestPermissions'), TIMEOUTS.permission, '알림 허용 창이 뜨지 않았어요.', 'perm_timeout'));
    if (nativePerm !== 'granted') throw Object.assign(new Error('알림이 허용되지 않았어요.'), { code: 'denied' });
    return;
  }
  if (Notification.permission === 'granted') return;
  const r = await withTimeout(Promise.resolve(Notification.requestPermission()), TIMEOUTS.permission,
    '알림 허용 창이 뜨지 않았어요.', 'perm_timeout');
  if (r !== 'granted') throw Object.assign(new Error('알림이 허용되지 않았어요.'), { code: 'denied' });
}

/** 알림 허용을 묻고 구독 (이미 있으면 그대로). 반환: PushSubscription */
export async function subscribe({ ask = true } = {}) {
  if (!supported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (ask) await askPermission();
  if (isNative()) return nativeSubscribe();
  const reg = await registration();
  const existing = await withTimeout(reg.pushManager.getSubscription(), 8000, '이 폰의 알림 구독 정보를 읽지 못했어요.', 'getsub_timeout');
  if (existing) return existing;
  return withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey()) }),
    TIMEOUTS.subscribe, '알림 서버 연결(구독)이 응답하지 않아요.', 'sub_timeout');
}

export async function unsubscribe() {
  if (isNative()) {
    const ep = nativeEndpoint;
    await callPN('unregister').catch(() => {});
    nativeEndpoint = null;
    return ep;
  }
  const sub = await current();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return endpoint;
}
