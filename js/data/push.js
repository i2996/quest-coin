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

/** 알림 허용을 묻고 구독 (이미 있으면 그대로). 반환: PushSubscription. onStep(이름)으로 지금 단계를 알려줌 */
export async function subscribe({ ask = true, onStep = () => {} } = {}) {
  if (!supported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (ask) {
    onStep('알림 허용 묻기');
    await askPermission();
  }
  onStep('앱 알림 처리기 준비');
  const reg = await registration();
  onStep('이 폰의 알림 구독 확인');
  const existing = await withTimeout(reg.pushManager.getSubscription(), 8000, '이 폰의 알림 구독 정보를 읽지 못했어요.', 'getsub_timeout');
  if (existing) return existing;
  onStep('알림 서버에 구독');
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
  await withTimeout(reg.showNotification(title, { body, icon: new URL('icons/icon-192.png', document.baseURI).href, tag: 'test' }), 5000, '테스트 알림을 띄우지 못했어요.', 'show_timeout');
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

/** 이 폰이 말해주는 알림 상태 (문제 생겼을 때 캡처용). 각 항목은 2~3초 안에 끝남 */
export async function deviceStatus() {
  const ua = navigator.userAgent;
  const browser = (ua.match(/SamsungBrowser\/[\d.]+/) || ua.match(/(?:CriOS|Chrome)\/\d+/) || ua.match(/Version\/[\d.]+.*Safari/) || ['?'])[0];
  const q = async (desc) => {
    try {
      return (await withTimeout(navigator.permissions.query(desc), 2000, 't', 't')).state;
    } catch {
      return '?';
    }
  };
  const lines = [];
  lines.push(`브라우저: ${browser} · 홈 화면 앱: ${isStandalone() ? '예' : '아니오'}`);
  lines.push(`알림 권한: ${supported() ? Notification.permission : '지원 안 함'} / ${await q({ name: 'notifications' })} / 푸시 ${await q({ name: 'push', userVisibleOnly: true })}`);
  let reg = null;
  try {
    reg = await withTimeout(navigator.serviceWorker.getRegistration(), 2000, 't', 't');
  } catch { /* 없음 */ }
  const ver = reg ? await swVersion().catch(() => null) : null;
  lines.push(`알림 처리기: ${reg ? (reg.active ? '작동 중' : '준비 중') : '없음'}${ver ? ` (${ver})` : ''} · 앱 제어: ${navigator.serviceWorker?.controller ? '예' : '아니오'}`);
  if (reg && 'pushManager' in reg) {
    let sub = '?';
    try {
      const s = await withTimeout(reg.pushManager.getSubscription(), 3000, 't', 't');
      sub = s ? `있음 (${new URL(s.endpoint).hostname})` : '없음';
    } catch {
      sub = '확인 안 됨(응답 없음)';
    }
    lines.push(`이 폰 구독: ${sub}`);
  }
  const last = await lastReceived();
  if (last) lines.push(`마지막 받은 서버 알림: ${new Date(last.at).toLocaleString('ko-KR')}`);
  return lines.join('\n');
}
