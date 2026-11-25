// 폰 알림 켜기/끄기 UI + 앱을 열 때 구독 정보 맞추기
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { api, mode } from '../data/api.js';
import { who, spaceId, isParentDevice } from '../core.js';
import * as push from '../data/push.js';
import { confirmDialog, toast } from './sheet.js';

/** 'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported' */
export function pushState() {
  if (push.isNative()) {
    // 안드로이드 앱: 허용이 꺼져 있으면 '차단', 켰으면 '켜짐'
    if (push.permission() === 'denied') return 'blocked';
    return prefs.pushOn() && push.permission() === 'granted' ? 'on' : 'off';
  }
  if (!push.supported()) return push.isIOS() && !push.isStandalone() ? 'ios-install' : 'unsupported';
  if (push.permission() === 'denied') return 'blocked';
  return prefs.pushOn() && push.permission() === 'granted' ? 'on' : 'off';
}

/** 지금 앱 주소 (예: quest.wurii.com) */
const host = () => (typeof location !== 'undefined' && location.host) || 'quest.wurii.com';

/** 이 폰/브라우저에 맞는 알림 허용 방법 (순수 함수) */
export function deviceGuide(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return '폰 설정 → 애플리케이션 → 퀘스트코인 → 알림 → "알림 허용" 켜기';
  }
  if (/SamsungBrowser/i.test(ua)) {
    return `① 삼성 인터넷 → 메뉴(≡) → 설정 → 사이트 및 다운로드 → 알림 → 이 사이트(${host()}) "허용"\n`
      + '② 폰 설정 → 애플리케이션 → 퀘스트코인(없으면 삼성 인터넷) → 알림 → "알림 허용" 켜기\n'
      + '③ 그래도 안 되면: 홈 화면의 퀘스트코인 아이콘 삭제 → 삼성 인터넷에서 다시 "홈 화면에 추가" → 아이콘으로 열어서 알림 켜기';
  }
  if (/iPhone|iPad|iPod|Macintosh/i.test(ua)) {
    return '① 사파리 공유 버튼(□↑) → "홈 화면에 추가" 한 앱으로 열기\n② 아이폰 설정 → 알림 → 퀘스트 코인 → 알림 허용';
  }
  if (/Android/i.test(ua)) {
    return `① 크롬 → 메뉴(⋮) → 설정 → 사이트 설정 → 알림 → 이 사이트(${host()}) "허용"\n`
      + '② 폰 설정 → 애플리케이션 → 퀘스트코인(없으면 Chrome) → 알림 → "알림 허용" 켜기';
  }
  return `브라우저 설정의 사이트 권한에서 이 사이트(${host()})의 알림을 허용해주세요.`;
}

const HELP = {
  'ios-install': '아이폰은 사파리 아래 공유 버튼(□↑) → "홈 화면에 추가" 한 뒤, 홈 화면의 퀘스트 코인 앱에서 알림을 켤 수 있어요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가한 앱(아이폰) 또는 크롬·삼성 인터넷(안드로이드)에서 써주세요.',
  blocked: '알림이 차단돼 있어요. 아래 순서로 허용한 뒤 다시 켜주세요.\n\n',
};

/** 아이 헤더의 종 버튼 */
export const bellButton = () => {
  const st = pushState();
  return `<button class="bell ${st === 'on' ? 'on' : ''}" data-act="push-toggle" aria-label="알림 ${st === 'on' ? '켜짐' : '꺼짐'}">${st === 'on' ? '🔔' : '🔕'}</button>`;
};

/** 알림 켜기 안내 배너 (꺼져 있고, 닫지 않았을 때) */
export function pushBanner() {
  const w = who();
  const st = pushState();
  if (!w || st === 'on' || st === 'unsupported' || prefs.pushBannerHidden(w)) return '';
  const text = w === 'parent'
    ? '아이가 "다 했어요"를 누르거나 코인 요청을 보내면 바로 알려드려요.'
    : '새 심부름, 🚨 돌발 미션, 코인이 들어오면 바로 알려줘요!';
  return `<div class="push-banner"><span class="pb-ic">🔔</span>
    <div><b>알림 켜기</b><small>${text}</small></div>
    <button class="btn sm primary" data-act="push-toggle">켜기</button>
    <button class="icon-btn sm" data-act="push-banner-close" aria-label="닫기">✕</button></div>`;
}

/** 부모 설정 목록의 알림 줄 */
export function pushSettingRow() {
  const st = pushState();
  const sub = { on: '켜짐 · 아이 완료·코인 요청이 오면 알려줘요', off: '꺼짐 · 눌러서 켜기', blocked: '차단됨 · 눌러서 방법 보기', 'ios-install': '홈 화면에 추가해야 켤 수 있어요', unsupported: '이 브라우저는 지원 안 해요' }[st];
  return `<li class="p-row"><span class="m-emoji sm">${st === 'on' ? '🔔' : '🔕'}</span>
    <div class="grow tap" data-act="push-toggle"><b>이 기기 알림</b><small>${sub}</small></div>
    <label class="switch"><input type="checkbox" data-act="push-toggle" ${st === 'on' ? 'checked' : ''} aria-label="이 기기 알림"><span></span></label></li>`;
}

let synced = '';
/** 지금 쓰는 사람 기준으로 서버 구독 정보 맞추기 (알림 켠 기기만). 화면 그릴 때마다 불려도 바뀐 경우에만 저장 */
export async function syncPush() {
  const w = who();
  if (!w || !state.data || mode === 'demo' || pushState() !== 'on') return;
  const key = `${spaceId()}|${w}|${state.data.role}`;
  if (synced === key) return;
  synced = key;
  try {
    if (w === 'parent' && !isParentDevice()) return;
    const sub = await push.subscribe({ ask: false }); // 브라우저가 구독을 잃었으면 다시 구독
    await api.savePush(spaceId(), sub, w === 'parent' ? null : w, w === 'parent');
  } catch (e) {
    synced = '';
    console.warn('push sync failed', e);
  }
}

let turningOn = false;
async function turnOn() {
  if (turningOn) return toast('알림 켜는 중이에요… 잠시만요');
  turningOn = true;
  try {
    // 어디서든 멈추면 70초 뒤 끝냄 (일부 브라우저는 허용 창을 안 띄우고 계속 기다림)
    await push.withTimeout(turnOnInner(), 70000, '알림 켜기가 너무 오래 걸려요.', 'all_timeout').catch((e) =>
      confirmDialog({ title: '알림을 켜지 못했어요', message: `${e.message}\n\n앱을 완전히 닫았다가 다시 열고 한 번 더 눌러주세요.`, ok: '알겠어요', cancel: '' }));
  } finally {
    turningOn = false;
  }
}

async function turnOnInner() {
  const st = pushState();
  if (HELP[st]) return confirmDialog({ title: '알림을 켤 수 없어요', message: HELP[st] + (st === 'blocked' ? deviceGuide() : ''), ok: '알겠어요', cancel: '' });
  const w = who();
  if (push.permission() !== 'granted') toast('🔔 알림 허용 창이 뜨면 "허용"을 눌러주세요');
  else toast('🔔 알림 켜는 중…');
  try {
    if (mode === 'demo') {
      await push.askPermission(); // 체험 모드: 서버가 없으니 허용만
    } else {
      const sub = await push.subscribe();
      await push.withTimeout(api.savePush(spaceId(), sub, w === 'parent' ? null : w, w === 'parent'), 15000,
        '가족 서버에 저장하지 못했어요 (응답 없음). 인터넷 연결을 확인해주세요.', 'save_timeout');
    }
    prefs.setPushOn(true);
    synced = `${spaceId()}|${w}|${state.data.role}`;
    set();
  } catch (e) {
    // 왜 안 켜졌는지 + 이 폰에서 허용하는 방법
    const denied = push.permission() === 'denied' || e.code === 'denied' || e.code === 'perm_timeout' || /허용되지 않았/.test(e.message || '');
    if (e.code === 'perm_timeout') e.message = '알림 허용 창이 뜨지 않았어요. 폰·브라우저 설정에서 직접 허용해 주세요.';
    if (e.code === 'sub_timeout') e.message = '알림 서버 연결이 응답하지 않아요. 인터넷 연결을 확인하고, 앱을 완전히 닫았다가 다시 열어 한 번 더 눌러주세요.';
    return confirmDialog({
      title: '알림을 켜지 못했어요',
      message: `${e.message || e}\n\n${denied ? '이 폰에서 알림을 허용하는 방법:\n' + deviceGuide() : '앱을 완전히 닫았다가 다시 열고 한 번 더 눌러주세요.'}`,
      ok: '알겠어요', cancel: '',
    });
  }
  toast(mode === 'demo' ? '체험 모드라 실제 알림은 오지 않아요' : '🔔 알림을 켰어요', 'ok');
}

async function turnOff() {
  const ok = await confirmDialog({ title: '이 기기 알림을 끌까요?', message: '이 폰으로는 알림이 오지 않아요.', ok: '끄기' });
  if (!ok) return set();
  prefs.setPushOn(false);
  synced = '';
  try {
    const endpoint = await push.unsubscribe();
    if (endpoint && mode !== 'demo') await api.deletePush(endpoint);
  } catch { /* 이미 없어진 구독 */ }
  set();
  toast('알림을 껐어요');
}

export const actions = {
  'push-toggle': () => (pushState() === 'on' ? turnOff() : turnOn()),
  'push-banner-close': () => {
    prefs.hidePushBanner(who());
    set();
  },
};
