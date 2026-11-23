// 폰 알림 켜기/끄기 UI + 앱을 열 때 구독 정보 맞추기
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { api, mode } from '../data/api.js';
import { who, spaceId, isParentDevice } from '../core.js';
import * as push from '../data/push.js';
import { confirmDialog, toast } from './sheet.js';

/** 'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported' */
export function pushState() {
  if (!push.supported()) return push.isIOS() && !push.isStandalone() ? 'ios-install' : 'unsupported';
  if (push.permission() === 'denied') return 'blocked';
  return prefs.pushOn() && push.permission() === 'granted' ? 'on' : 'off';
}

const HELP = {
  'ios-install': '아이폰은 사파리 아래 공유 버튼(□↑) → "홈 화면에 추가" 한 뒤, 홈 화면의 퀘스트 코인 앱에서 알림을 켤 수 있어요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요. 안드로이드는 크롬, 아이폰은 홈 화면에 추가한 앱에서 써주세요.',
  blocked: '알림이 차단돼 있어요. 브라우저(또는 폰 설정)의 사이트 설정에서 이 사이트 알림을 허용한 뒤 다시 켜주세요.',
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
    ${st === 'on' ? '<button class="btn sm" data-act="push-test">테스트</button>' : ''}
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

async function turnOn() {
  const st = pushState();
  if (HELP[st]) return confirmDialog({ title: '알림을 켤 수 없어요', message: HELP[st], ok: '알겠어요', cancel: '' });
  const w = who();
  try {
    if (mode === 'demo') {
      // 체험 모드: 서버가 없으니 허용만 받고 테스트 알림
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('알림이 허용되지 않았어요.');
    } else {
      const sub = await push.subscribe();
      await api.savePush(spaceId(), sub, w === 'parent' ? null : w, w === 'parent');
    }
    prefs.setPushOn(true);
    synced = `${spaceId()}|${w}|${state.data.role}`;
    set();
    await push.showTest('🔔 알림이 켜졌어요', w === 'parent' ? '아이 소식을 이 폰으로 알려드릴게요' : '심부름이 생기면 바로 알려줄게요!');
    if (mode === 'demo') toast('체험 모드라 실제 알림은 오지 않아요 (테스트 알림만)', '');
  } catch (e) {
    toast(e.message || '알림을 켜지 못했어요', 'err');
  }
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
  'push-test': () => push.showTest().catch((e) => toast(e.message, 'err')),
  'push-banner-close': () => {
    prefs.hidePushBanner(who());
    set();
  },
};
