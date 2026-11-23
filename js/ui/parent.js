// 부모 화면: 확인 · 미션 · 퀘스트 · 상점 · 가족
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { api, mode } from '../data/api.js';
import { run, today, spaceId, formData } from '../core.js';
import { balanceOf, fmt, won, cashUsedThisMonth } from '../logic/coins.js';
import { goalCard } from './kid.js';
import { kidToday, repeatLabel, DAY_CHOICES, kidSurprises } from '../logic/missions.js';
import { questProgress, questGoalLabel } from '../logic/quests.js';
import { timeAgo, countdown, shortDate, addDays, dateLabel } from '../logic/dates.js';
import {
  esc, coin, avatar, kidById, missionById, sortedKids, kidNames, empty, progressBar, emojiPicker, kidPicker,
  KID_COLORS, KID_EMOJIS, MISSION_EMOJIS, ITEM_EMOJIS, QUEST_EMOJIS, CATEGORIES,
} from './components.js';
import { openSheet, closeSheet, confirmDialog, toast } from './sheet.js';
import { confetti } from './fx.js';
import { pushBanner, pushSettingRow } from './notify.js';

const TABS = [
  { id: 'check', label: '확인', ic: '✅' },
  { id: 'missions', label: '미션', ic: '📋' },
  { id: 'quests', label: '퀘스트', ic: '🏆' },
  { id: 'shop', label: '상점', ic: '🛒' },
  { id: 'family', label: '가족', ic: '👨‍👩‍👧' },
];

const pendingSubs = () => state.data.submissions.filter((s) => s.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
const pendingReqs = () => state.data.requests.filter((r) => r.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
const fullGoals = () => (state.data.goals || []).filter((g) => g.status === 'full');
const liveGoals = () => (state.data.goals || []).filter((g) => g.status === 'open' || g.status === 'full').sort((a, b) => b.created_at.localeCompare(a.created_at));
const recentSends = (n = 5) => state.data.ledger.filter((l) => l.ref_type === 'transfer' && l.amount < 0).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n);

export function renderParent() {
  const tab = state.ui.parentTab;
  const badge = pendingSubs().length + pendingReqs().length + fullGoals().length;
  const body = { check: checkTab, missions: missionsTab, quests: questsTab, shop: shopTab, family: familyTab }[tab]?.() ?? '';
  return `
  <header class="parent-head">
    <button class="who-btn" data-act="switch-who" aria-label="사용자 바꾸기"><span class="avatar lg">🛡️</span><span><small>${esc(state.data.space.name)}</small><b>부모님</b></span></button>
    ${mode === 'demo' ? '<span class="demo-tag">체험 모드</span>' : ''}
  </header>
  <main class="page parent-page" data-tab="${tab}">${body}</main>
  <nav class="tabbar">${TABS.map((t) => `<button class="${tab === t.id ? 'on' : ''}" data-act="p-tab" data-tab="${t.id}">
    <span class="tab-ic">${t.ic}${t.id === 'check' && badge ? `<em class="badge">${badge}</em>` : ''}</span>${t.label}</button>`).join('')}</nav>`;
}

/* ---------------- 확인 ---------------- */
function checkTab() {
  const subs = pendingSubs();
  const reqs = pendingReqs();
  const kids = sortedKids();
  return `${pushBanner()}
  <section class="p-sec"><h2>완료 확인 <span class="count">${subs.length}</span>
      ${subs.length > 1 ? '<button class="btn sm primary" data-act="approve-all">모두 승인</button>' : ''}</h2>
    ${subs.length ? `<ul class="p-list">${subs.map(subRow).join('')}</ul>` : '<p class="muted pad">확인할 심부름이 없어요</p>'}</section>
  <section class="p-sec"><h2>코인 사용 요청 <span class="count">${reqs.length}</span></h2>
    ${reqs.length ? `<ul class="p-list">${reqs.map(reqRow).join('')}</ul>` : '<p class="muted pad">새 요청이 없어요</p>'}</section>
  ${fullGoals().length ? `<section class="p-sec"><h2>🫙 다 모인 목표 <span class="count">${fullGoals().length}</span></h2>
    <div class="goal-list">${fullGoals().map((g) => goalCard(g, { parent: true })).join('')}</div></section>` : ''}
  ${recentSends().length ? `<section class="p-sec"><h2>💌 최근 보내기</h2><ul class="p-list">${recentSends().map(sendRow).join('')}</ul></section>` : ''}
  <section class="p-sec"><h2>아이들 현황</h2>
    ${kids.length ? `<div class="kid-stats">${kids.map(kidStat).join('')}</div>
      <button class="btn big quick-btn" data-act="new-quick">✍️ 말로 시킨 심부름 기록</button>` : empty('🧒', '아이를 먼저 추가해주세요', '가족 탭에서 추가할 수 있어요')}</section>`;
}

function subRow(s) {
  const k = kidById(s.kid_id);
  const m = missionById(s.mission_id);
  return `<li class="p-row">${avatar(k)}
    <div class="grow"><b>${esc(m?.emoji || '')} ${esc(m?.title || '삭제된 미션')}</b>
      <small>${esc(k?.name)} · ${m?.kind === 'surprise' ? '⚡돌발 · ' : ''}${dateLabel(s.occurrence_date)} · ${timeAgo(s.created_at)}</small></div>
    ${coin(s.reward, 'sm')}
    <button class="icon-btn no" data-act="reject-sub" data-id="${s.id}" aria-label="다시 하기">✕</button>
    <button class="icon-btn yes" data-act="approve-sub" data-id="${s.id}" aria-label="승인">✓</button></li>`;
}

const REQ_ACTION = { shop: '기프티콘 보냈어요', cash: '용돈 줬어요', proxy: '대신 사줬어요' };
const REQ_KIND = { shop: '🎁 기프티콘', cash: '💵 용돈 교환', proxy: '🙏 대신 사주세요' };
function reqRow(r) {
  const k = kidById(r.kid_id);
  return `<li class="p-row req">${avatar(k)}
    <div class="grow"><small>${REQ_KIND[r.kind]}</small><b>${r.kind === 'cash' ? `${won(r.won)} 주기` : `${esc(r.emoji || '')} ${esc(r.title)}`}</b>
      ${r.memo ? `<small>“${esc(r.memo)}”</small>` : ''}<small>${esc(k?.name)} · ${timeAgo(r.created_at)}</small></div>
    <div class="col">${coin(r.coins, 'sm')}
      <button class="btn sm primary" data-act="req-done" data-id="${r.id}">${REQ_ACTION[r.kind]}</button>
      <button class="link danger" data-act="req-reject" data-id="${r.id}">거절(환불)</button></div></li>`;
}

function sendRow(l) {
  const from = kidById(l.kid_id);
  return `<li class="p-row">${avatar(from)}<div class="grow"><b>${esc(l.reason.replace(/^💌 /, `${from?.name || ''} → `).replace('에게 보냄', ''))}</b>
    <small>${timeAgo(l.created_at)}</small></div>${coin(-l.amount, 'sm')}</li>`;
}

function kidStat(k) {
  const list = kidToday(state.data, k.id, today());
  const done = list.filter((x) => x.status === 'approved').length;
  return `<button class="kid-stat" data-act="kid-today" data-id="${k.id}" style="--kc:${esc(k.color)}">
    ${avatar(k, 'lg')}<b>${esc(k.name)}</b>${coin(balanceOf(state.data.ledger, k.id))}
    <small>오늘 ${done}/${list.length}</small>${progressBar(list.length ? (done / list.length) * 100 : 0)}</button>`;
}

/* ---------------- 미션 ---------------- */
function missionsTab() {
  const d = state.data;
  const chores = d.missions.filter((m) => m.kind === 'chore').sort((a, b) => Number(b.active) - Number(a.active) || a.created_at.localeCompare(b.created_at));
  const now = Date.now();
  const surprises = d.missions
    .filter((m) => m.kind === 'surprise' && m.active && (!m.expires_at || new Date(m.expires_at) > now - 86400000))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return `
  <button class="surprise-launch" data-act="new-surprise"><span class="siren">🚨</span><b>돌발 미션 발동!</b><small>아이 화면에 팝업으로 떠요</small></button>
  <button class="quick-launch" data-act="new-quick"><span>✍️</span><b>말로 시킨 심부름 기록</b><small>바로 코인 적립 + 퀘스트 심부름 수 +1</small></button>
  ${surprises.length ? `<section class="p-sec"><h2>돌발 미션</h2><ul class="p-list">${surprises.map(surpriseRow).join('')}</ul></section>` : ''}
  <section class="p-sec"><h2>심부름 <span class="count">${chores.filter((m) => m.active).length}</span>
      <button class="btn sm primary" data-act="new-chore">+ 추가</button></h2>
    ${chores.length ? `<ul class="p-list">${chores.map(choreRow).join('')}</ul>` : empty('📋', '심부름을 추가해보세요', '매일·요일마다·한 번 중에서 고를 수 있어요')}</section>`;
}

function choreRow(m) {
  return `<li class="p-row tap ${m.active ? '' : 'off'}" data-act="edit-chore" data-id="${m.id}">
    <span class="m-emoji sm">${esc(m.emoji)}</span>
    <div class="grow"><b>${esc(m.title)}</b><small>${repeatLabel(m)}${m.due_date ? ` · ${shortDate(m.due_date)}까지` : ''} · ${esc(kidNames(m.kid_ids))}${m.active ? '' : ' · 쉬는 중'}</small></div>
    ${coin(m.reward, 'sm')}</li>`;
}

function surpriseRow(m) {
  const subs = state.data.submissions.filter((s) => s.mission_id === m.id && s.status !== 'rejected');
  const expired = m.expires_at && new Date(m.expires_at) <= Date.now();
  const who = subs.map((s) => `${esc(kidById(s.kid_id)?.name || '')}${s.status === 'pending' ? '(확인 중)' : ' ✓'}`).join(', ');
  return `<li class="p-row surprise-row ${expired ? 'off' : ''}">
    <span class="m-emoji sm">${esc(m.emoji)}</span>
    <div class="grow"><b>${esc(m.title)}</b>
      <small>${m.first_come ? '선착순 · ' : ''}${esc(kidNames(m.kid_ids))} · ${expired ? '마감됨' : m.expires_at ? `<span class="timer" data-until="${esc(m.expires_at)}">${countdown(m.expires_at)}</span> 남음` : '마감 없음'}</small>
      ${who ? `<small>도전: ${who}</small>` : ''}</div>
    ${coin(m.reward, 'sm')}
    <button class="link danger" data-act="end-surprise" data-id="${m.id}">${expired ? '지우기' : '끝내기'}</button></li>`;
}

/* ---------------- 퀘스트 ---------------- */
function questsTab() {
  const qs = [...state.data.quests].sort((a, b) => Number(b.active) - Number(a.active) || a.created_at.localeCompare(b.created_at));
  return `<section class="p-sec"><h2>퀘스트 <button class="btn sm primary" data-act="new-quest">+ 추가</button></h2>
    <p class="hint pad">주간·월간 심부름을 모두 하거나, 심부름을 n개 하면 깨지는 도전 과제예요.</p>
    ${qs.length ? `<div class="p-quests">${qs.map(questBlock).join('')}</div>` : empty('🏆', '퀘스트를 만들어보세요')}</section>`;
}

function questBlock(q) {
  const kids = sortedKids().filter((k) => !q.kid_ids.length || q.kid_ids.includes(k.id));
  return `<article class="p-quest ${q.active ? '' : 'off'}" data-act="edit-quest" data-id="${q.id}">
    <div class="q-head"><span class="q-emoji">${esc(q.emoji)}</span><div><b>${esc(q.title)}</b><small>${questGoalLabel(q)}${q.active ? '' : ' · 쉬는 중'}</small></div>${coin(q.reward, 'sm')}</div>
    ${kids
      .map((k) => {
        const p = questProgress(q, k.id, state.data, today());
        return `<div class="q-kid">${avatar(k, 'sm')}${progressBar(p.pct, p.complete ? 'full' : '')}<span>${p.done}/${p.total}${p.claimed ? ' 🏅' : p.complete ? ' 🎁' : ''}</span></div>`;
      })
      .join('')}</article>`;
}

/* ---------------- 상점 ---------------- */
function shopTab() {
  const items = [...state.data.items].sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort || a.price - b.price);
  const sp = state.data.space;
  return `<section class="p-sec"><h2>기프티콘 목록 <button class="btn sm primary" data-act="new-item">+ 추가</button></h2>
    ${items.length ? `<ul class="p-list">${items.map(itemRow).join('')}</ul>` : empty('🛍️', '아이가 살 수 있는 상품을 올려주세요', '간식, 치킨, 피자, 게임 시간 등')}</section>
  <section class="p-sec"><h2>🫙 같이 모으기 <span class="count">${liveGoals().length}</span></h2>
    <p class="hint pad">아이들이 만든 목표예요. 다 모이면 '확인' 탭에 떠요.</p>
    ${liveGoals().length ? `<div class="goal-list">${liveGoals().map((g) => goalCard(g, { parent: true })).join('')}</div>` : '<p class="muted pad">모으는 중인 목표가 없어요</p>'}</section>
  <section class="p-sec"><h2>용돈 교환 비율</h2>
    <button class="p-row tap" data-act="edit-settings"><span class="m-emoji sm">💵</span><div class="grow"><b>1코인 = ${won(sp.coin_rate)}</b><small>눌러서 바꾸기</small></div></button></section>`;
}

function itemRow(i) {
  const cat = CATEGORIES.find((c) => c.id === i.category);
  return `<li class="p-row tap ${i.active ? '' : 'off'}" data-act="edit-item" data-id="${i.id}">
    <span class="m-emoji sm">${esc(i.emoji)}</span>
    <div class="grow"><b>${esc(i.title)}</b><small>${cat?.label || ''}${i.stock != null ? ` · 재고 ${i.stock}` : ''}${i.active ? '' : ' · 판매 중지'}</small></div>
    ${coin(i.price, 'sm')}</li>`;
}

/* ---------------- 가족 ---------------- */
function familyTab() {
  const sp = state.data.space;
  const kids = sortedKids();
  return `
  <section class="p-sec"><h2>아이들 <button class="btn sm primary" data-act="new-kid">+ 추가</button></h2>
    ${kids.length ? `<ul class="p-list">${kids.map((k) => `<li class="p-row">${avatar(k)}
        <div class="grow tap" data-act="edit-kid" data-id="${k.id}"><b>${esc(k.name)}</b><small>${hasLimitColumn() === false ? '⚠️ 용돈 한도: DB 업데이트 필요' : k.cash_limit == null ? '용돈 한도 없음' : `이번 달 용돈 ${won(cashUsedThisMonth(state.data.requests, k.id))} / ${won(k.cash_limit)}`} · 눌러서 수정</small></div>
        ${coin(balanceOf(state.data.ledger, k.id), 'sm')}
        <button class="btn sm" data-act="adjust" data-id="${k.id}">± 코인</button></li>`).join('')}</ul>` : empty('🧒', '아이를 추가해주세요')}</section>
  <section class="p-sec"><h2>설정</h2>
    <ul class="p-list">
      <li class="p-row tap" data-act="edit-settings"><span class="m-emoji sm">⚙️</span><div class="grow"><b>${esc(sp.name)}</b>
        <small>1코인 = ${won(sp.coin_rate)} · ${sp.auto_approve ? '완료하면 바로 적립' : '부모님 확인 후 적립'}</small></div></li>
      ${mode === 'demo' ? '' : `<li class="p-row"><span class="m-emoji sm">🔑</span><div class="grow"><b>가족 코드 <code class="code">${esc(sp.code)}</code></b>
        <small>아이 폰에서 이 코드 + 가족 비밀번호로 들어와요</small></div><button class="btn sm" data-act="share-code">공유</button></li>
      <li class="p-row tap" data-act="change-secret" data-which="password"><span class="m-emoji sm">🔒</span><div class="grow"><b>가족 비밀번호 바꾸기</b></div></li>`}
      ${pushSettingRow()}
      <li class="p-row tap" data-act="change-secret" data-which="pin"><span class="m-emoji sm">🛡️</span><div class="grow"><b>부모 PIN 바꾸기</b></div></li>
      <li class="p-row tap" data-act="parent-off"><span class="m-emoji sm">🚪</span><div class="grow"><b>이 기기 부모 모드 끄기</b><small>아이에게 폰을 빌려줄 때 (다시 켜려면 PIN)</small></div></li>
      <li class="p-row tap" data-act="gate-leave"><span class="m-emoji sm">↩️</span><div class="grow"><b>${mode === 'demo' ? '체험 끝내기' : '이 기기에서 가족 공간 나가기'}</b></div></li>
    </ul></section>`;
}

/* ---------------- 입력 시트 ---------------- */
const num = (v, d = 0) => (v === '' || v == null || Number.isNaN(Number(v)) ? d : Math.floor(Number(v)));
const delBtn = (act, id) => (id ? `<button type="button" class="btn ghost danger" data-act="${act}" data-id="${id}">삭제</button>` : '');

function choreSheet(m = null) {
  const v = m || { emoji: MISSION_EMOJIS[0], title: '', memo: '', reward: 10, kid_ids: [], repeat: 'daily', repeat_days: [], due_date: '', active: true };
  openSheet({
    title: m ? '심부름 수정' : '심부름 추가',
    body: `<form data-form="chore" class="form">
      <input type="hidden" name="id" value="${m?.id || ''}">
      <label>무엇을 할까요?<input name="title" type="text" maxlength="40" value="${esc(v.title)}" placeholder="예: 신발 정리하기" required></label>
      ${emojiPicker('emoji', MISSION_EMOJIS, v.emoji)}
      <label>보상 코인<input name="reward" type="number" inputmode="numeric" min="0" value="${v.reward}" required></label>
      <fieldset><legend>언제</legend>
        <div class="seg small">${[['daily', '매일'], ['weekly', '요일마다'], ['none', '한 번']].map(([id, l]) => `<label><input type="radio" name="repeat" value="${id}" ${v.repeat === id ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <div class="days" data-show="weekly">${DAY_CHOICES.map((d) => `<label><input type="checkbox" name="repeat_days" data-multi value="${d}" ${v.repeat_days.includes(d) ? 'checked' : ''}><span>${'일월화수목금토'[d]}</span></label>`).join('')}</div>
        <label data-show="none">이 날까지 <small>(비우면 끝낼 때까지)</small><input name="due_date" type="date" value="${esc(v.due_date || '')}"></label>
      </fieldset>
      <fieldset><legend>누가</legend>${kidPicker('kid_ids', v.kid_ids)}</fieldset>
      <label>설명 <small>(선택)</small><textarea name="memo" rows="2" maxlength="200">${esc(v.memo || '')}</textarea></label>
      ${m ? `<label class="switch"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}><span>사용 중</span></label>` : ''}
      ${m ? '<button type="button" class="btn" data-act="do-for" data-id="' + m.id + '">아이 대신 오늘 완료 처리…</button>' : ''}
      <div class="form-actions">${delBtn('del-chore', m?.id)}<button class="btn primary big">저장</button></div>
    </form>`,
    onMount: syncRepeat,
  });
}

function syncRepeat(root) {
  const f = root.querySelector('form');
  if (!f) return;
  const upd = () => {
    const r = f.querySelector('[name=repeat]:checked')?.value;
    f.querySelectorAll('[data-show]').forEach((el) => (el.hidden = el.dataset.show !== r));
  };
  f.addEventListener('change', upd);
  upd();
}

function surpriseSheet() {
  openSheet({
    title: '🚨 돌발 미션 발동',
    cls: 'hot',
    body: `<form data-form="surprise" class="form">
      <label>미션<input name="title" type="text" maxlength="40" placeholder="예: 택배 상자 현관에서 가져오기" required></label>
      ${emojiPicker('emoji', ['⚡', '📦', '🗑️', '🧺', '🛒', '🐶', '🧹', '🍽️', '🚀', '🎯'], '⚡')}
      <label>보상 코인<input name="reward" type="number" inputmode="numeric" min="0" value="30" required></label>
      <fieldset><legend>제한 시간</legend>
        <div class="seg small wrap">${[['10', '10분'], ['30', '30분'], ['60', '1시간'], ['180', '3시간'], ['eod', '오늘 안에']].map(([id, l], i) => `<label><input type="radio" name="limit" value="${id}" ${i === 2 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>누가</legend>${kidPicker('kid_ids', [])}
        <label class="switch"><input type="checkbox" name="first_come"><span>선착순 1명만 (먼저 한 사람이 보상)</span></label></fieldset>
      <label>설명 <small>(선택)</small><textarea name="memo" rows="2" maxlength="200"></textarea></label>
      <button class="btn hot big">발동! 🚨</button></form>`,
  });
}

function quickSheet(kidId = null) {
  const chores = state.data.missions.filter((m) => m.kind === 'chore' && m.active);
  openSheet({
    title: '✍️ 말로 시킨 심부름',
    body: `<p class="hint">앱에 없던 심부름을 말로 시켰을 때 기록해요. 바로 코인이 들어가고, 퀘스트의 '심부름 n개'에도 1개로 세요.</p>
      <form data-form="quick" class="form">
      <fieldset><legend>누가 했나요?</legend>${kidPicker('kid_ids', kidId ? [kidId] : sortedKids().length === 1 ? [sortedKids()[0].id] : []).replace(/<p class="hint">아무도.*?<\/p>/, '')}</fieldset>
      ${chores.length ? `<fieldset><legend>비슷한 심부름에서 고르기 <small>(선택)</small></legend><div class="quick">${chores
        .map((m) => `<button type="button" class="chip" data-act="quick-fill" data-title="${esc(m.title)}" data-emoji="${esc(m.emoji)}" data-reward="${m.reward}">${esc(m.emoji)} ${esc(m.title)}</button>`)
        .join('')}</div></fieldset>` : ''}
      <label>무슨 심부름?<input name="title" type="text" maxlength="40" placeholder="예: 마트에서 우유 사오기" required></label>
      ${emojiPicker('emoji', ['✍️', ...MISSION_EMOJIS], '✍️')}
      <label>보상 코인<input name="reward" type="number" inputmode="numeric" min="0" value="10" required></label>
      <fieldset><legend>언제</legend><div class="seg small">
        <label><input type="radio" name="when" value="0" checked><span>오늘</span></label>
        <label><input type="radio" name="when" value="-1"><span>어제</span></label></div></fieldset>
      <button class="btn primary big">기록하고 코인 주기</button></form>`,
  });
}

function questSheet(q = null) {
  const v = q || { emoji: '🏆', title: '', goal: 'all', target: 10, period: 'week', start_date: today(), end_date: addDays(today(), 6), mission_ids: [], kid_ids: [], reward: 100, active: true };
  const chores = state.data.missions.filter((m) => m.kind === 'chore' && m.active);
  openSheet({
    title: q ? '퀘스트 수정' : '퀘스트 추가',
    body: `<form data-form="quest" class="form">
      <input type="hidden" name="id" value="${q?.id || ''}">
      <label>퀘스트 이름<input name="title" type="text" maxlength="40" value="${esc(v.title)}" placeholder="예: 이번 주 올클리어" required></label>
      ${emojiPicker('emoji', QUEST_EMOJIS, v.emoji)}
      <fieldset><legend>목표</legend>
        <div class="seg small">${[['all', '정해진 심부름 모두'], ['count', '심부름 n개']].map(([id, l]) => `<label><input type="radio" name="goal" value="${id}" ${v.goal === id ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <label data-goal="count">몇 개?<input name="target" type="number" inputmode="numeric" min="1" value="${v.target}"></label>
        <div data-goal="all"><p class="hint">대상 심부름 (안 고르면 모든 심부름 · 돌발 미션 제외)</p>
          <div class="kid-pick">${chores.map((m) => `<label><input type="checkbox" name="mission_ids" data-multi value="${m.id}" ${v.mission_ids.includes(m.id) ? 'checked' : ''}><span>${esc(m.emoji)} ${esc(m.title)}</span></label>`).join('') || '<p class="hint">심부름이 아직 없어요</p>'}</div></div>
      </fieldset>
      <fieldset><legend>기간</legend>
        <div class="seg small">${[['week', '매주'], ['month', '매달'], ['range', '기간 지정']].map(([id, l]) => `<label><input type="radio" name="period" value="${id}" ${v.period === id ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <div class="row2" data-period="range"><label>시작<input name="start_date" type="date" value="${esc(v.start_date || today())}"></label>
          <label>끝<input name="end_date" type="date" value="${esc(v.end_date || addDays(today(), 6))}"></label></div>
        <p class="hint" data-period="week">매주 월요일에 새로 시작해요</p><p class="hint" data-period="month">매달 1일에 새로 시작해요</p>
      </fieldset>
      <label>보상 코인<input name="reward" type="number" inputmode="numeric" min="0" value="${v.reward}" required></label>
      <fieldset><legend>누가</legend>${kidPicker('kid_ids', v.kid_ids)}</fieldset>
      ${q ? `<label class="switch"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}><span>진행 중</span></label>` : ''}
      <div class="form-actions">${delBtn('del-quest', q?.id)}<button class="btn primary big">저장</button></div>
    </form>`,
    onMount: (root) => {
      const f = root.querySelector('form');
      const upd = () => {
        const g = f.querySelector('[name=goal]:checked')?.value;
        const p = f.querySelector('[name=period]:checked')?.value;
        f.querySelectorAll('[data-goal]').forEach((el) => (el.hidden = el.dataset.goal !== g));
        f.querySelectorAll('[data-period]').forEach((el) => (el.hidden = el.dataset.period !== p));
      };
      f.addEventListener('change', upd);
      upd();
    },
  });
}

function itemSheet(i = null) {
  const v = i || { emoji: ITEM_EMOJIS[0], title: '', category: 'snack', price: 50, memo: '', stock: null, active: true };
  openSheet({
    title: i ? '상품 수정' : '상품 추가',
    body: `<form data-form="item" class="form">
      <input type="hidden" name="id" value="${i?.id || ''}">
      <label>상품 이름<input name="title" type="text" maxlength="40" value="${esc(v.title)}" placeholder="예: 치킨 한 마리" required></label>
      ${emojiPicker('emoji', ITEM_EMOJIS, v.emoji)}
      <fieldset><legend>종류</legend><div class="seg small wrap">${CATEGORIES.map((c) => `<label><input type="radio" name="category" value="${c.id}" ${v.category === c.id ? 'checked' : ''}><span>${c.emoji} ${c.label}</span></label>`).join('')}</div></fieldset>
      <div class="row2"><label>가격 (코인)<input name="price" type="number" inputmode="numeric" min="1" value="${v.price}" required></label>
        <label>재고 <small>(비우면 무제한)</small><input name="stock" type="number" inputmode="numeric" min="0" value="${v.stock ?? ''}"></label></div>
      <p class="hint">참고: 지금 비율이면 ${fmt(v.price)}코인 = ${won(v.price * state.data.space.coin_rate)}</p>
      <label>안내 <small>(선택)</small><input name="memo" type="text" maxlength="100" value="${esc(v.memo || '')}" placeholder="예: 주말에만 시켜줄게요"></label>
      ${i ? `<label class="switch"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}><span>판매 중</span></label>` : ''}
      <div class="form-actions">${delBtn('del-item', i?.id)}<button class="btn primary big">저장</button></div>
    </form>`,
  });
}

/** DB 에 용돈 한도 칸이 있나: true / false / null(아이가 없어서 아직 모름) */
function hasLimitColumn() {
  if (mode === 'demo') return true;
  if (!state.data.kids.length) return null;
  return state.data.kids.some((x) => 'cash_limit' in x);
}
const isMissingColumn = (e) => /cash_limit|schema cache|DB 준비/i.test(e?.message || '');

function kidSheet(k = null) {
  const used = state.data.kids.length;
  const v = k || { name: '', emoji: KID_EMOJIS[used % KID_EMOJIS.length], color: KID_COLORS[used % KID_COLORS.length], cash_limit: 10000 };
  openSheet({
    title: k ? '아이 정보 수정' : '아이 추가',
    body: `<form data-form="kid" class="form">
      <input type="hidden" name="id" value="${k?.id || ''}">
      <label>이름<input name="name" type="text" maxlength="12" value="${esc(v.name)}" required></label>
      <fieldset><legend>캐릭터</legend>${emojiPicker('emoji', KID_EMOJIS, v.emoji)}</fieldset>
      <fieldset><legend>색</legend><div class="color-pick">${KID_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === v.color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></fieldset>
      <label>한 달 용돈 한도 (원) <small>(비우면 제한 없음)</small><input name="cash_limit" type="number" inputmode="numeric" min="0" step="100" value="${v.cash_limit ?? ''}" placeholder="제한 없음"></label>
      <p class="hint">한 달에 코인을 용돈(현금)으로 바꿀 수 있는 최대 금액이에요. 넘는 코인은 기프티콘·같이 모으기에 쓰거나 다음 달로 넘어가요.</p>
      ${hasLimitColumn() === false ? '<p class="warn-box">⚠️ DB 업데이트가 필요해요. Supabase SQL Editor 에서 <b>supabase/schema.sql</b> 을 다시 실행해야 용돈 한도가 저장돼요.</p>' : ''}
      <div class="form-actions">${delBtn('del-kid', k?.id)}<button class="btn primary big">저장</button></div>
    </form>`,
  });
}

/* ---------------- 동작 ---------------- */
const byId = (list, id) => state.data[list].find((x) => x.id === id);

async function deleteThing(kind, id, title, message) {
  const ok = await confirmDialog({ title, message, ok: '삭제', danger: true });
  if (!ok) return;
  if (await run(() => api.remove(kind, id), '삭제했어요')) closeSheet();
}

export const actions = {
  'p-tab': (el) => {
    set({ parentTab: el.dataset.tab });
    window.scrollTo(0, 0);
  },
  'approve-sub': (el) => run(() => api.decideSubmission(el.dataset.id, true), '승인! 코인을 줬어요'),
  'reject-sub': async (el) => {
    const ok = await confirmDialog({ title: '다시 하라고 할까요?', message: '코인은 주지 않고, 아이가 다시 완료를 누를 수 있어요.', ok: '다시 하기' });
    if (ok) run(() => api.decideSubmission(el.dataset.id, false));
  },
  'approve-all': async () => {
    const subs = pendingSubs();
    const ok = await confirmDialog({ title: `${subs.length}개 모두 승인할까요?`, ok: '모두 승인' });
    if (!ok) return;
    if (await run(async () => { for (const s of subs) await api.decideSubmission(s.id, true); })) {
      confetti();
      toast('모두 승인했어요', 'ok');
    }
  },
  'req-done': async (el) => {
    const r = byId('requests', el.dataset.id);
    const note = await confirmDialog({ title: REQ_ACTION[r.kind] + '?', message: `${r.title} — 아이 쿠폰함에 '받았어요'로 표시돼요.`, ok: '완료', input: { placeholder: '아이에게 한마디 (선택)' } });
    if (note == null) return;
    run(() => api.decideRequest(r.id, 'done', note), '처리했어요');
  },
  'req-reject': async (el) => {
    const r = byId('requests', el.dataset.id);
    const note = await confirmDialog({ title: '거절할까요?', message: `${fmt(r.coins)}코인은 아이에게 돌려줘요.`, ok: '거절', danger: true, input: { placeholder: '이유 (선택)' } });
    if (note == null) return;
    run(() => api.decideRequest(r.id, 'rejected', note), '거절하고 코인을 돌려줬어요');
  },
  'goal-done': async (el) => {
    const g = byId('goals', el.dataset.id);
    const ok = await confirmDialog({ title: `'${g.title}' 사줬나요?`, message: '목표가 완료로 바뀌어요.', ok: '사줬어요' });
    if (ok && (await run(() => api.goalDecide(g.id, 'done'), '완료했어요'))) confetti();
  },
  'kid-today': (el) => {
    const k = kidById(el.dataset.id);
    const list = kidToday(state.data, k.id, today());
    const sur = kidSurprises(state.data, k.id, Date.now(), today());
    const all = [...sur, ...list];
    openSheet({
      title: `${k.name} 오늘`,
      body: all.length
        ? `<ul class="p-list">${all.map((x) => `<li class="p-row"><span class="m-emoji sm">${esc(x.m.emoji)}</span>
            <div class="grow"><b>${esc(x.m.title)}</b><small>${{ todo: '아직', pending: '확인 기다리는 중', approved: '완료 ✓', rejected: '다시 하기' }[x.status]}</small></div>
            ${coin(x.m.reward, 'sm')}
            ${x.status === 'approved' ? '' : `<button class="btn sm primary" data-act="complete-for" data-k="${x.m.id}|${k.id}|${x.date}">완료 처리</button>`}</li>`).join('')}</ul>`
        : empty('🌈', '오늘 할 심부름이 없어요'),
      cls: 'kid-today',
    });
    document.querySelector('.sheet-body')?.insertAdjacentHTML('beforeend',
      `<button class="btn big quick-btn" data-act="new-quick" data-kid="${k.id}">✍️ 말로 시킨 심부름 기록</button>`);
  },
  'complete-for': async (el) => {
    const [mid, kid, date] = el.dataset.k.split('|');
    if (await run(() => api.completeFor(mid, kid, date), '완료 처리하고 코인을 줬어요')) closeSheet();
  },
  'do-for': (el) => {
    const m = missionById(el.dataset.id);
    const kids = sortedKids().filter((k) => !m.kid_ids.length || m.kid_ids.includes(k.id));
    const date = m.repeat === 'none' ? m.start_date : today();
    openSheet({
      title: `${m.title} — 대신 완료`,
      body: `<p class="hint">누가 했나요? 바로 코인이 적립돼요.</p><div class="who-grid sm">${kids
        .map((k) => `<button class="who-card" data-act="complete-for" data-k="${m.id}|${k.id}|${date}">${avatar(k, 'lg')}<b>${esc(k.name)}</b></button>`)
        .join('')}</div>`,
    });
  },
  'new-chore': () => choreSheet(),
  'edit-chore': (el) => choreSheet(byId('missions', el.dataset.id)),
  'del-chore': (el) => deleteThing('missions', el.dataset.id, '심부름을 삭제할까요?', '완료 기록도 같이 지워져요. (받은 코인은 그대로)'),
  'new-surprise': () => {
    if (!state.data.kids.length) return toast('아이를 먼저 추가해주세요', 'err');
    surpriseSheet();
  },
  'end-surprise': async (el) => {
    const m = byId('missions', el.dataset.id);
    const expired = m.expires_at && new Date(m.expires_at) <= Date.now();
    if (expired) return run(() => api.save('missions', { id: m.id, active: false }));
    const ok = await confirmDialog({ title: '돌발 미션을 끝낼까요?', message: '아이 화면에서 사라져요.', ok: '끝내기' });
    if (ok) run(() => api.save('missions', { id: m.id, active: false }), '끝냈어요');
  },
  'new-quick': (el) => {
    if (!state.data.kids.length) return toast('아이를 먼저 추가해주세요', 'err');
    quickSheet(el.dataset.kid || null);
  },
  'quick-fill': (el) => {
    const f = el.closest('form');
    f.querySelector('[name=title]').value = el.dataset.title;
    f.querySelector('[name=reward]').value = el.dataset.reward;
    const r = f.querySelector(`[name=emoji][value="${CSS.escape(el.dataset.emoji)}"]`);
    if (r) r.checked = true;
  },
  'new-quest': () => questSheet(),
  'edit-quest': (el) => questSheet(byId('quests', el.dataset.id)),
  'del-quest': (el) => deleteThing('quests', el.dataset.id, '퀘스트를 삭제할까요?', '보상 기록도 같이 지워져요. (받은 코인은 그대로)'),
  'new-item': () => itemSheet(),
  'edit-item': (el) => itemSheet(byId('items', el.dataset.id)),
  'del-item': (el) => deleteThing('items', el.dataset.id, '상품을 삭제할까요?', '이미 산 쿠폰은 그대로 남아요. 잠깐 숨기려면 \'판매 중\'을 끄세요.'),
  'new-kid': () => kidSheet(),
  'edit-kid': (el) => kidSheet(byId('kids', el.dataset.id)),
  'del-kid': (el) => deleteThing('kids', el.dataset.id, '아이를 삭제할까요?', '이 아이의 코인과 기록이 모두 지워져요. 되돌릴 수 없어요.'),
  adjust: (el) => {
    const k = kidById(el.dataset.id);
    openSheet({
      title: `${k.name} 코인 주기/빼기`,
      body: `<form data-form="adjust" class="form"><input type="hidden" name="id" value="${k.id}">
        <p class="center">지금 ${coin(balanceOf(state.data.ledger, k.id), 'lg')}</p>
        <div class="seg small"><label><input type="radio" name="sign" value="1" checked><span>➕ 보너스</span></label><label><input type="radio" name="sign" value="-1"><span>➖ 차감</span></label></div>
        <label>코인<input name="amount" type="number" inputmode="numeric" min="1" required></label>
        <label>이유<input name="reason" type="text" maxlength="40" placeholder="예: 동생을 잘 도와줘서"></label>
        <button class="btn primary big">적용</button></form>`,
    });
  },
  'edit-settings': () => {
    const sp = state.data.space;
    openSheet({
      title: '설정',
      body: `<form data-form="settings" class="form">
        <label>가족 이름<input name="name" type="text" maxlength="20" value="${esc(sp.name)}" required></label>
        <label>1코인 = 몇 원? <small>(용돈 교환 비율)</small><input name="coin_rate" type="number" inputmode="numeric" min="1" value="${sp.coin_rate}" required></label>
        <label class="switch"><input type="checkbox" name="auto_approve" ${sp.auto_approve ? 'checked' : ''}><span>부모 확인 없이 바로 적립</span></label>
        <p class="hint">끄면 아이가 '다 했어요'를 누른 뒤 부모님이 승인해야 코인이 들어가요.</p>
        <button class="btn primary big">저장</button></form>`,
    });
  },
  'share-code': async () => {
    const sp = state.data.space;
    const url = `${location.origin}${location.pathname}?code=${sp.code}`;
    const text = `퀘스트 코인 가족 코드: ${sp.code}\n${url}\n(비밀번호는 따로 알려줄게요)`;
    try {
      if (navigator.share) await navigator.share({ title: '퀘스트 코인', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('복사했어요', 'ok');
      }
    } catch { /* 공유 취소 */ }
  },
  'change-secret': async (el) => {
    const pin = el.dataset.which === 'pin';
    const v = await confirmDialog({ title: pin ? '새 부모 PIN' : '새 가족 비밀번호', message: '4자 이상', ok: '바꾸기', input: { type: 'password', inputmode: pin ? 'numeric' : 'text' } });
    if (v == null) return;
    run(() => api.changeSecret(spaceId(), el.dataset.which, v), '바꿨어요');
  },
  'parent-off': async () => {
    const ok = await confirmDialog({ title: '부모 모드를 끌까요?', message: '이 기기에서 다시 부모 화면을 열려면 PIN 이 필요해요.', ok: '끄기' });
    if (!ok) return;
    prefs.setWho(null);
    run(() => api.parentLogout(spaceId()));
  },
};

export const forms = {
  chore: async (f) => {
    const d = formData(f);
    const days = (d.repeat_days || []).map(Number);
    if (d.repeat === 'weekly' && !days.length) return toast('요일을 하나 이상 골라주세요', 'err');
    const row = {
      kind: 'chore', title: d.title.trim(), emoji: d.emoji, reward: num(d.reward), memo: d.memo.trim() || null,
      repeat: d.repeat, repeat_days: d.repeat === 'weekly' ? days : [], due_date: d.repeat === 'none' ? d.due_date || null : null,
      kid_ids: d.kid_ids || [],
    };
    if (d.id) {
      row.id = d.id;
      row.active = !!d.active;
    } else {
      row.space_id = spaceId();
      row.start_date = today();
    }
    if (await run(() => api.save('missions', row), '저장했어요')) closeSheet();
  },
  surprise: async (f) => {
    const d = formData(f);
    let exp;
    if (d.limit === 'eod') {
      exp = new Date();
      exp.setHours(23, 59, 59, 0);
    } else exp = new Date(Date.now() + Number(d.limit) * 60000);
    const row = {
      space_id: spaceId(), kind: 'surprise', title: d.title.trim(), emoji: d.emoji, reward: num(d.reward), memo: d.memo.trim() || null,
      kid_ids: d.kid_ids || [], first_come: !!d.first_come, expires_at: exp.toISOString(), start_date: today(), repeat: 'none',
    };
    if (await run(() => api.save('missions', row))) {
      closeSheet();
      toast('🚨 돌발 미션 발동! 아이 화면에 팝업이 떠요', 'ok');
    }
  },
  quick: async (f) => {
    const d = formData(f);
    const kids = d.kid_ids || [];
    if (!kids.length) return toast('누가 했는지 골라주세요', 'err');
    const date = addDays(today(), Number(d.when || 0));
    const reward = num(d.reward);
    if (await run(() => api.quickChore(spaceId(), kids, d.title.trim(), d.emoji, reward, date), `${kids.length}명에게 ${fmt(reward)}코인을 줬어요`)) {
      closeSheet();
      confetti();
    }
  },
  quest: async (f) => {
    const d = formData(f);
    if (d.period === 'range' && d.end_date < d.start_date) return toast('끝 날짜가 시작보다 빨라요', 'err');
    const row = {
      title: d.title.trim(), emoji: d.emoji, goal: d.goal, target: Math.max(1, num(d.target, 1)), period: d.period,
      start_date: d.period === 'range' ? d.start_date : null, end_date: d.period === 'range' ? d.end_date : null,
      mission_ids: d.goal === 'all' ? d.mission_ids || [] : [], kid_ids: d.kid_ids || [], reward: num(d.reward),
    };
    if (d.id) {
      row.id = d.id;
      row.active = !!d.active;
    } else row.space_id = spaceId();
    if (await run(() => api.save('quests', row), '저장했어요')) closeSheet();
  },
  item: async (f) => {
    const d = formData(f);
    const row = {
      title: d.title.trim(), emoji: d.emoji, category: d.category, price: Math.max(1, num(d.price, 1)),
      stock: d.stock === '' ? null : Math.max(0, num(d.stock)), memo: d.memo.trim() || null,
    };
    if (d.id) {
      row.id = d.id;
      row.active = !!d.active;
    } else row.space_id = spaceId();
    if (await run(() => api.save('items', row), '저장했어요')) closeSheet();
  },
  kid: async (f) => {
    const d = formData(f);
    const row = { name: d.name.trim(), emoji: d.emoji, color: d.color };
    const limit = d.cash_limit === '' || d.cash_limit == null ? null : Math.max(0, num(d.cash_limit));
    if (d.id) row.id = d.id;
    else {
      row.space_id = spaceId();
      row.sort = state.data.kids.length;
    }
    // 용돈 한도 칸이 DB 에 없으면(SQL 미실행) 나머지만 저장하고, 한도가 저장 안 됐다고 분명히 알림
    let limitDropped = false;
    const ok = await run(async () => {
      if (hasLimitColumn() !== false) {
        try {
          return await api.save('kids', { ...row, cash_limit: limit });
        } catch (e) {
          if (!isMissingColumn(e)) throw e;
        }
      }
      limitDropped = true;
      return api.save('kids', row);
    });
    if (!ok) return;
    closeSheet();
    if (limitDropped) {
      await confirmDialog({
        title: '용돈 한도는 저장되지 않았어요',
        message: '이름·캐릭터는 저장됐지만, DB 에 용돈 한도 칸이 아직 없어요. Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행한 뒤 한도를 다시 입력해주세요.',
        ok: '알겠어요', cancel: '',
      });
    } else toast('저장했어요', 'ok');
  },
  adjust: async (f) => {
    const d = formData(f);
    const amount = num(d.amount) * Number(d.sign);
    if (!amount) return toast('코인을 입력해주세요', 'err');
    if (await run(() => api.adjust(d.id, amount, d.reason), amount > 0 ? '보너스를 줬어요' : '차감했어요')) closeSheet();
  },
  settings: async (f) => {
    const d = formData(f);
    const patch = { name: d.name.trim(), coin_rate: Math.max(1, num(d.coin_rate, 100)), auto_approve: !!d.auto_approve };
    if (await run(() => api.updateSpace(spaceId(), patch), '저장했어요')) closeSheet();
  },
};
