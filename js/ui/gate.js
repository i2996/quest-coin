// 시작 화면: 가족 공간 만들기 / 들어가기 / 체험 + '누가 쓰나요?'
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { api, use, mode } from '../data/api.js';
import { reload, run, formData, spaceId } from '../core.js';
import { esc, avatar, sortedKids } from './components.js';
import { openSheet, closeSheet, confirmDialog, toast } from './sheet.js';

export function renderStart() {
  const invite = new URLSearchParams(location.search).get('code') || '';
  return `<main class="gate">
    <div class="gate-logo"><i class="coin-ic huge spin"></i></div>
    <h1>퀘스트 코인</h1>
    <p class="gate-sub">심부름하고 코인 모아서<br>간식·치킨·용돈으로 바꿔요!</p>
    <div class="gate-actions">
      <button class="btn primary big" data-act="gate-join">${invite ? `초대 코드 ${esc(invite)} 로 들어가기` : '가족 코드로 들어가기'}</button>
      <button class="btn big" data-act="gate-create">새 가족 공간 만들기 (부모님)</button>
      <button class="btn ghost" data-act="gate-demo">먼저 체험해보기</button>
    </div>
    <p class="hint">체험 모드는 이 기기에만 저장돼요. 부모 PIN: 0000</p>
  </main>`;
}

export function renderWho() {
  const kids = sortedKids();
  return `<main class="gate who">
    <h1>누가 쓰나요?</h1>
    <p class="gate-sub">${esc(state.data.space.name)}</p>
    <div class="who-grid">
      ${kids.map((k) => `<button class="who-card" data-act="who-kid" data-id="${k.id}" style="--kc:${esc(k.color)}">${avatar(k, 'xl')}<b>${esc(k.name)}</b></button>`).join('')}
      <button class="who-card parent" data-act="who-parent"><span class="avatar xl">🛡️</span><b>부모님</b><small>PIN 필요</small></button>
    </div>
    ${kids.length ? '' : '<p class="hint">아이가 아직 없어요. 부모님으로 들어가서 아이를 추가해주세요.</p>'}
    <button class="btn ghost sm" data-act="gate-leave">다른 가족 공간으로</button>
  </main>`;
}

async function enter(space, m) {
  prefs.setSpace({ id: space.id, mode: m });
  await reload();
  window.dispatchEvent(new Event('qc:space'));
}

/** 부모 화면으로 갈 때는 항상 PIN 확인 (부모 폰을 아이가 빌려 쓰는 경우 대비) */
export async function askParentPin() {
  const pin = await confirmDialog({ title: '부모님 확인', message: '부모 PIN 을 입력해주세요', ok: '확인', input: { type: 'password', inputmode: 'numeric', placeholder: 'PIN' } });
  if (pin == null || pin === '') return false;
  const ok = await run(() => api.parentLogin(spaceId(), pin));
  if (ok === true) return true;
  if (ok === false || ok === null) toast('PIN 이 맞지 않아요', 'err');
  return false;
}

export const actions = {
  'gate-demo': async () => {
    await use('demo');
    const sp = await api.startDemo();
    prefs.setWho(null);
    await enter(sp, 'demo');
  },
  'gate-create': () =>
    openSheet({
      title: '새 가족 공간 만들기',
      body: `<form data-form="create" class="form">
        <label>가족 이름<input name="name" type="text" placeholder="예: 하늘이네" maxlength="20"></label>
        <label>가족 비밀번호 <small>아이 폰에서 들어올 때 써요</small><input name="password" type="password" minlength="4" required autocomplete="new-password"></label>
        <label>부모 PIN <small>아이에게 알려주지 마세요! 승인·상점 관리용</small><input name="pin" type="password" inputmode="numeric" minlength="4" required autocomplete="off"></label>
        <button class="btn primary big">만들기</button></form>`,
    }),
  'gate-join': () => {
    const invite = new URLSearchParams(location.search).get('code') || '';
    openSheet({
      title: '가족 코드로 들어가기',
      body: `<form data-form="join" class="form">
        <label>가족 코드<input name="code" type="text" value="${esc(invite)}" maxlength="6" autocapitalize="characters" required style="text-transform:uppercase;letter-spacing:.2em"></label>
        <label>가족 비밀번호<input name="password" type="password" required></label>
        <button class="btn primary big">들어가기</button></form>`,
    });
  },
  'who-kid': (el) => {
    prefs.setWho(el.dataset.id);
    set({ kidTab: 'missions' });
  },
  'who-parent': async () => {
    if (!(await askParentPin())) return;
    prefs.setWho('parent');
    set({ parentTab: 'check' });
  },
  'gate-leave': async () => {
    const ok = await confirmDialog({ title: '가족 공간에서 나갈까요?', message: '이 기기에서만 나가요. 다시 들어오려면 코드와 비밀번호가 필요해요.', ok: '나가기', danger: true });
    if (!ok) return;
    if (mode === 'demo') (await import('../data/local.js')).wipe();
    prefs.setSpace(null);
    prefs.setWho(null);
    state.data = null;
    window.dispatchEvent(new Event('qc:space'));
  },
};

export const forms = {
  create: async (f) => {
    const d = formData(f);
    await use('remote');
    const sp = await run(() => api.createSpace(d.name, d.password, d.pin));
    if (!sp || sp === true) return;
    closeSheet();
    prefs.setWho('parent');
    await enter(sp, 'remote');
    toast(`가족 코드: ${sp.code} — 아이 폰에서 이 코드로 들어와요`, 'ok');
  },
  join: async (f) => {
    const d = formData(f);
    await use('remote');
    const sp = await run(() => api.joinSpace(d.code.trim().toUpperCase(), d.password));
    if (!sp || sp === true) return;
    closeSheet();
    prefs.setWho(null);
    history.replaceState(null, '', location.pathname);
    await enter(sp, 'remote');
  },
};
