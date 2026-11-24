// 시작점: 백엔드 고르기 → 가족 공간 불러오기 → 실시간 구독 → 화면 그리기 / 이벤트 연결
import { state, onChange, set } from './state.js';
import { prefs } from './prefs.js';
import { api, use } from './data/api.js';
import { reload, who } from './core.js';
import { balanceOf } from './logic/coins.js';
import { countdown } from './logic/dates.js';
import * as gate from './ui/gate.js';
import * as kid from './ui/kid.js';
import * as parent from './ui/parent.js';
import * as notify from './ui/notify.js';
import * as photos from './ui/photos.js';
import { closeSheet, toast } from './ui/sheet.js';
import { coinRain } from './ui/fx.js';

const root = document.getElementById('root');
const popupRoot = document.getElementById('popup-root');

const actions = {
  ...gate.actions, ...kid.actions, ...parent.actions, ...notify.actions, ...photos.actions,
  'sheet-close': () => closeSheet(),
  'switch-who': () => {
    prefs.setWho(null);
    set();
  },
};
const forms = { ...gate.forms, ...kid.forms, ...parent.forms, ...photos.forms };

function view() {
  if (!state.data) return gate.renderStart();
  const w = who();
  if (!w) return gate.renderWho();
  return w === 'parent' ? parent.renderParent() : kid.renderKid();
}

function render() {
  const w = state.data ? who() : null;
  document.body.dataset.mode = !state.data ? 'start' : !w ? 'who' : w === 'parent' ? 'parent' : 'kid';
  const y = window.scrollY;
  // 입력 중인 곳(상점 폼 등)은 실시간 갱신으로 지워지지 않게: 값 보존
  const keep = [...root.querySelectorAll('form[data-form] [name]')].map((el) => [el.closest('form').dataset.form, el.name, el.type, el.value, el.checked]);
  const focused = document.activeElement?.name;
  root.innerHTML = view();
  for (const [form, name, type, value, checked] of keep) {
    const el = root.querySelector(`form[data-form="${form}"] [name="${name}"]${type === 'radio' || type === 'checkbox' ? `[value="${CSS.escape(value)}"]` : ''}`);
    if (!el) continue;
    if (type === 'radio' || type === 'checkbox') el.checked = checked;
    else el.value = value;
  }
  if (focused) root.querySelector(`[name="${focused}"]`)?.focus({ preventScroll: true });
  window.scrollTo(0, y);
  popupRoot.innerHTML = w && w !== 'parent' ? kid.surprisePopup() : '';
  document.body.classList.toggle('popup-on', !!popupRoot.innerHTML);
  celebrateGain(w);
  notify.syncPush();
  photos.hydratePhotos(root);
  window.__appReady = true;
}

/** 아이 화면: 코인이 늘었으면 (부모님이 승인했을 때 등) 코인 쏟아지기 */
function celebrateGain(w) {
  if (!w || w === 'parent') return;
  const now = balanceOf(state.data.ledger, w);
  const last = prefs.lastBalance(w);
  if (last != null && now > last) coinRain(now - last, '코인 획득!');
  if (last !== now) prefs.setLastBalance(w, now);
}

onChange(render);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => toast(err.message || '문제가 생겼어요', 'err'));
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form];
  if (fn) Promise.resolve(fn(f)).catch((err) => toast(err.message || '문제가 생겼어요', 'err'));
});
document.addEventListener('input', kid.onInput);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());

// 남은 시간 표시: 1초마다 갱신, 마감되면 다시 그리기
setInterval(() => {
  let expired = false;
  document.querySelectorAll('[data-until]').forEach((el) => {
    const left = new Date(el.dataset.until) - Date.now();
    if (left <= 0) expired = true;
    el.textContent = countdown(el.dataset.until);
    el.classList.toggle('urgent', left < 5 * 60000);
  });
  if (expired && state.data) set();
}, 1000);

// 자정이 지나면 '오늘' 이 바뀌므로 다시 그리기 + 앱으로 돌아오면 최신 데이터
let lastDay = new Date().toDateString();
setInterval(() => {
  if (new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    set();
  }
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.data) reload().catch(() => {});
});

let unsub = null;
let debounce = null;
async function openSpace() {
  unsub?.();
  unsub = null;
  const sp = prefs.getSpace();
  if (!sp) {
    state.data = null;
    set();
    return;
  }
  try {
    await use(sp.mode);
    await reload();
    if (!state.data) {
      prefs.setSpace(null);
      toast('가족 공간에 다시 들어와주세요', 'err');
      set();
      return;
    }
    unsub = api.subscribe(sp.id, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => reload().catch(() => {}), 250);
    });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<main class="gate"><div class="gate-logo">⚠️</div><h1>연결하지 못했어요</h1>
      <p class="gate-sub">${String(e.message || e).replace(/</g, '&lt;')}</p>
      <button class="btn primary" onclick="location.reload()">다시 시도</button>
      <button class="btn ghost sm" id="reset-space">처음 화면으로</button></main>`;
    document.getElementById('reset-space').onclick = () => {
      prefs.setSpace(null);
      location.reload();
    };
    window.__appReady = true;
  }
}
window.addEventListener('qc:space', openSpace);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

openSpace().then(() => {
  if (!state.data) render();
});
