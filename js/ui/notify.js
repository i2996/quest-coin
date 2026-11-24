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
    ${st === 'on' ? '<button class="btn sm" data-act="push-test">점검</button>' : ''}
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

const REASON = {
  not_logged_in: '로그인 정보가 없어요. 앱을 새로고침한 뒤 다시 해주세요.',
  not_registered: '이 폰이 알림 서버에 등록돼 있지 않아요. 알림을 껐다가 다시 켜주세요.',
  no_vapid: '알림 서버에 알림 키(VAPID)가 없어요. Supabase → Edge Functions → Secrets 에 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY 가 있어야 해요.',
};

/** 서버 테스트 결과 → 사람이 읽을 설명 (순수 함수) */
export function explainTest(r, kidName = (id) => id) {
  const lines = [];
  if (r.ok) lines.push('✅ 알림 서버가 이 폰으로 알림을 보냈어요. 몇 초 안에 "서버 알림 테스트"가 오면 정상이에요.');
  else if (r.reason === 'push_failed') {
    const vapidMismatch = r.status === 403 || /vapid|mismatch|BadJwtToken/i.test(r.error || '');
    lines.push(vapidMismatch
      ? '❌ 알림 키가 맞지 않아요. 앱의 VAPID 공개 키와 Supabase 비밀값 VAPID_PRIVATE_KEY 가 한 쌍이 아니에요.'
      : '❌ 알림 전송이 실패했어요.');
    lines.push(`(오류 ${r.status || '?'}: ${String(r.error || '').slice(0, 120)})`);
  } else lines.push('❌ ' + (REASON[r.reason] || (String(r.reason || '').startsWith('bad_vapid') ? '알림 키(VAPID) 값이 올바르지 않아요.' : `문제가 있어요 (${r.reason})`)));
  if (r.as) lines.push('', `이 폰은 "${r.as === 'parent' ? '부모님' : kidName(r.as)}" 알림을 받아요.`);
  if (r.parents != null) {
    lines.push(`알림 켠 부모 폰: ${r.parents}대 · 알림 켠 아이: ${(r.kids || []).map(kidName).join(', ') || '없음'}`);
  }
  if (r.log) {
    lines.push('', '최근 알림 기록:');
    if (!r.log.length) lines.push('· 아직 없어요 (심부름 완료·요청이 생기면 여기에 쌓여요)');
    for (const l of r.log) {
      const t = new Date(l.created_at);
      const when = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      lines.push(`· ${when} ${l.title || l.kind} → ${l.sent}대${l.note && l.note !== 'ok' ? ` (${l.note})` : ''}`);
    }
  }
  return lines.join('\n');
}

/** 이 폰 쪽 점검 결과 설명 (순수 함수) */
export function explainDevice({ serverOk, received, seconds, swVer, latest, ios, standalone, prevLast }) {
  const lines = [];
  if (prevLast) {
    const t = new Date(prevLast.at);
    const hm = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    lines.push(`📥 이번 점검 전에 이 폰이 마지막으로 받은 서버 알림: ${hm} "${prevLast.title}"${prevLast.error && /\/ /.test(prevLast.error) ? ' (화면에 띄우지 못함)' : ''}`);
  }
  if (swVer && latest && swVer !== latest) {
    lines.push(`⚠️ 이 폰의 알림 처리기가 옛 버전이에요 (${swVer}, 최신 ${latest}). 앱을 완전히 닫았다가(위로 밀어 끄기) 다시 열어주세요.`);
  }
  if (!serverOk) return lines.join('\n');
  if (received && received.error && !/\/ /.test(received.error)) {
    lines.push(`📱 이 폰이 ${seconds}초 만에 서버 알림을 받았어요. (추가 옵션 없이 다시 띄웠어요)`);
  } else if (received && received.error) {
    lines.push(`📱 이 폰이 서버 알림을 받았지만 화면에 띄우지 못했어요: ${received.error.slice(0, 120)}`);
  } else if (received) {
    lines.push(`📱 이 폰이 ${seconds}초 만에 서버 알림을 받아서 화면에 띄웠어요.`);
    lines.push(ios
      ? '그런데도 안 보였다면: 아이폰 설정 → 알림 → 퀘스트 코인 → 알림 허용·배너 켜기, 그리고 집중 모드(방해 금지)를 확인해주세요.'
      : '그런데도 안 보였다면: 폰 설정 → 알림 → 크롬(또는 퀘스트 코인) 알림 허용, 방해 금지 모드를 확인해주세요.');
  } else {
    lines.push('📱 10초 안에 이 폰에 서버 알림이 도착하지 않았어요.');
    if (ios && !standalone) lines.push('아이폰은 홈 화면에 추가한 앱에서 열어야 알림을 받아요.');
    else if (ios) lines.push('아이폰: 홈 화면의 퀘스트 코인 아이콘을 길게 눌러 삭제 → 사파리에서 다시 "홈 화면에 추가" → 알림 다시 켜기를 해보세요. (예전 구독이 끊긴 경우가 많아요)');
    else lines.push('알림을 껐다가 다시 켜고, 폰의 절전/배터리 최적화에서 크롬을 제외해 보세요.');
  }
  return lines.join('\n');
}

async function serverTest() {
  if (mode === 'demo') {
    await push.showTest().catch((e) => toast(e.message, 'err'));
    return toast('체험 모드라 이 기기 테스트 알림만 보내요', '');
  }
  const w = who();
  const kidName = (id) => state.data.kids.find((k) => k.id === id)?.name || '아이';
  let msg;
  let endpoint = null;
  try {
    const sub = await push.current();
    if (!sub) throw new Error(REASON.not_registered);
    endpoint = sub.endpoint;
    await api.savePush(spaceId(), sub, w === 'parent' ? null : w, w === 'parent'); // 지금 쓰는 사람으로 다시 등록
    toast('알림 서버에 테스트를 요청했어요… (10초 정도 걸려요)');
    const since = Date.now();
    const [swVer, latest, prevLast] = await Promise.all([push.swVersion(), push.latestVersion(), push.lastReceived()]);
    const r = await api.serverPushTest(endpoint);
    const received = r.ok ? await push.waitForPush(since, 10000) : null;
    msg = explainTest(r, kidName) + '\n\n' + explainDevice({
      prevLast, serverOk: !!r.ok, received, seconds: received ? Math.max(1, Math.round((received.at - since) / 1000)) : 0,
      swVer, latest, ios: push.isIOS(), standalone: push.isStandalone(),
    });
  } catch (e) {
    msg = '❌ ' + (e.message || e);
  }
  const again = await confirmDialog({ title: '알림 점검 결과', message: msg.trim(), ok: '닫기', cancel: endpoint ? '10초 뒤 다시 (앱 닫고 확인)' : '' });
  if (again === null && endpoint) {
    // 앱을 닫은 상태(백그라운드)에서도 오는지 확인
    api.serverPushTest(endpoint, 10).catch(() => {});
    await confirmDialog({ title: '10초 뒤에 보내요', message: '지금 홈 화면으로 나가서(앱 닫기) 기다려 보세요. "서버 알림 테스트"가 오면 정상이에요.', ok: '알겠어요', cancel: '' });
  }
}

export const actions = {
  'push-toggle': () => (pushState() === 'on' ? turnOff() : turnOn()),
  'push-test': () => serverTest(),
  'push-banner-close': () => {
    prefs.hidePushBanner(who());
    set();
  },
};
