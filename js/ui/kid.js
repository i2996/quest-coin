// 아이 화면: 미션 · 퀘스트 · 상점 · 지갑
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { api } from '../data/api.js';
import { run, today, who, formData } from '../core.js';
import { balanceOf, fmt, won, cashLeft, cashUsedThisMonth, goalParts, goalSum } from '../logic/coins.js';
import { kidToday, kidLaterThisWeek, kidSurprises, liveSurprises, repeatLabel } from '../logic/missions.js';
import { questProgress, questsFor, questGoalLabel } from '../logic/quests.js';
import { dateLabel, shortDate, timeAgo, countdown } from '../logic/dates.js';
import { esc, coin, avatar, kidById, empty, progressBar, CATEGORIES, missionById, sortedKids, ITEM_EMOJIS, emojiPicker } from './components.js';
import { openSheet, closeSheet, confirmDialog, toast } from './sheet.js';
import { coinRain, confetti } from './fx.js';
import { bellButton, pushBanner } from './notify.js';
import { submitWith, forgetPhotoOf } from './photos.js';

const TABS = [
  { id: 'missions', label: '미션', ic: '🗡️' },
  { id: 'quests', label: '퀘스트', ic: '🏆' },
  { id: 'shop', label: '상점', ic: '🛒' },
  { id: 'wallet', label: '지갑', ic: '👛' },
];

const kid = () => kidById(who());
const bal = () => balanceOf(state.data.ledger, who());

export function renderKid() {
  const k = kid();
  const tab = state.ui.kidTab;
  const d = state.data;
  const surprises = kidSurprises(d, k.id, Date.now(), today());
  const liveCount = liveSurprises(surprises).length;
  const questReady = questsFor(d.quests, k.id).filter((q) => {
    const p = questProgress(q, k.id, d, today());
    return p.complete && !p.claimed && p.phase !== 'upcoming';
  }).length;
  const badges = { missions: liveCount, quests: questReady };
  const body = { missions: missionsTab, quests: questsTab, shop: shopTab, wallet: walletTab }[tab]?.(k) ?? '';
  return `
  <header class="kid-head" style="--kc:${esc(k.color)}">
    <button class="who-btn" data-act="switch-who" aria-label="사용자 바꾸기">${avatar(k, 'lg')}<span><small>모험가</small><b>${esc(k.name)}</b></span></button>
    <div class="head-right">${bellButton()}<div class="wallet-pill" data-act="kid-tab" data-tab="wallet"><i class="coin-ic big"></i><b data-bal>${fmt(bal())}</b></div></div>
  </header>
  <main class="page kid-page" data-tab="${tab}">${body}</main>
  <nav class="tabbar">${TABS.map((t) => `<button class="${tab === t.id ? 'on' : ''}" data-act="kid-tab" data-tab="${t.id}">
      <span class="tab-ic">${t.ic}${badges[t.id] ? `<em class="badge">${badges[t.id]}</em>` : ''}</span>${t.label}</button>`).join('')}</nav>`;
}

/* ---------------- 미션 ---------------- */
function missionsTab(k) {
  const d = state.data;
  const list = kidToday(d, k.id, today());
  const surprises = kidSurprises(d, k.id, Date.now(), today());
  const later = kidLaterThisWeek(d, k.id, today());
  const done = list.filter((x) => x.status === 'approved' || x.status === 'pending').length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return `${pushBanner()}
  ${surprises.length ? `<section class="surprise-zone">
      <h2 class="zone-title"><span class="siren">🚨</span> 돌발 미션</h2>
      ${surprises.map(surpriseCard).join('')}</section>` : ''}
  <section class="today-head">
    <div><h2>오늘의 심부름</h2><small>${dateLabel(today())}</small></div>
    <div class="ring" style="--p:${pct}"><b>${done}/${list.length}</b></div>
  </section>
  ${list.length ? `<ul class="mission-list">${list.map(missionCard).join('')}</ul>` : empty('🌈', '오늘은 심부름이 없어요', '돌발 미션이 뜰지도 몰라요…')}
  ${list.length && done === list.length ? '<p class="cheer">🎉 오늘 심부름 끝! 멋져요!</p>' : ''}
  ${later.length ? `<details class="later"><summary>이번 주에 남은 심부름 ${later.length}개</summary>
      <ul>${later.map((x) => `<li><span>${esc(x.m.emoji)} ${esc(x.m.title)}</span><small>${dateLabel(x.date)}</small>${coin(x.m.reward, 'sm')}</li>`).join('')}</ul></details>` : ''}`;
}

const statusBtn = (x) => {
  const key = `${x.m.id}|${x.date}`;
  if (x.status === 'approved') return `<span class="st done">완료 ✓</span>`;
  if (x.status === 'pending') return `<button class="st wait" data-act="unsubmit" data-id="${x.sub.id}">확인 중 ⏳</button>`;
  const again = x.status === 'rejected';
  if (x.m.photo_required) return `<button class="btn go" data-act="photo-submit" data-k="${key}">📷 ${again ? '다시 찍기' : '사진 찍고 완료'}</button>`;
  return `<div class="go-row"><button class="cam-btn" data-act="photo-submit" data-k="${key}" aria-label="사진 찍고 완료">📷</button><button class="btn go" data-act="submit" data-k="${key}">${again ? '다시 했어요' : '다 했어요!'}</button></div>`;
};
const photoNote = (x) => (x.sub?.photo_path && x.status !== 'todo' && x.status !== 'rejected' ? ' · 📷 사진 보냄' : x.m.photo_required && x.status === 'todo' ? ' · 📷 사진 필요' : '');

function missionCard(x) {
  const m = x.m;
  return `<li class="mission ${x.status}">
    <span class="m-emoji">${esc(m.emoji)}</span>
    <div class="m-body"><b>${esc(m.title)}</b>
      <small>${repeatLabel(m)}${x.dueSoon ? ` · ${shortDate(x.dueSoon)}까지` : ''}${photoNote(x)}${x.status === 'rejected' ? ' · <em class="warn">부모님이 다시 해달래요</em>' : ''}</small>
      ${m.memo ? `<p class="m-memo">${esc(m.memo)}</p>` : ''}</div>
    <div class="m-side">${coin(m.reward)}${statusBtn(x)}</div></li>`;
}

function surpriseCard(x) {
  const m = x.m;
  let foot;
  if (x.status === 'approved') foot = '<span class="st done">성공! ✓</span>';
  else if (x.status === 'pending') foot = `<button class="st wait" data-act="unsubmit" data-id="${x.sub.id}">확인 중 ⏳</button>`;
  else if (m.photo_required) foot = `<button class="btn go hot" data-act="photo-submit" data-k="${m.id}|${x.date}">📷 사진 찍고 해냈어요!</button>`;
  else foot = `<div class="go-row"><button class="cam-btn" data-act="photo-submit" data-k="${m.id}|${x.date}" aria-label="사진 찍고 완료">📷</button><button class="btn go hot" data-act="submit" data-k="${m.id}|${x.date}">해냈어요!</button></div>`;
  return `<article class="surprise ${x.status}">
    <div class="s-top"><span class="s-emoji">${esc(m.emoji)}</span>
      <div><b>${esc(m.title)}</b>${m.memo ? `<p>${esc(m.memo)}</p>` : ''}
        <small>${m.first_come ? '⚡ 선착순 1명!' : '누구나 도전'}${m.expires_at && x.status !== 'approved' ? ` · <span class="timer" data-until="${esc(m.expires_at)}">${countdown(m.expires_at)}</span> 남음` : ''}</small></div></div>
    <div class="s-foot">${coin(m.reward, 'lg')}${foot}</div></article>`;
}

/** 돌발 미션 팝업 (안 본 것이 있으면) */
export function surprisePopup() {
  const k = kid();
  if (!k) return '';
  const seen = prefs.seen(k.id);
  const fresh = liveSurprises(kidSurprises(state.data, k.id, Date.now(), today())).find((x) => !seen.includes(x.m.id));
  if (!fresh) return '';
  const m = fresh.m;
  return `<div class="popup-wrap" role="alertdialog" aria-modal="true" aria-label="돌발 미션">
    <div class="popup-flash"></div>
    <div class="popup">
      <div class="popup-alarm">⚠️ 돌발 미션 발생! ⚠️</div>
      <div class="popup-emoji">${esc(m.emoji)}</div>
      <h2>${esc(m.title)}</h2>
      ${m.memo ? `<p>${esc(m.memo)}</p>` : ''}
      <div class="popup-reward">보상 ${coin(m.reward, 'xl')}</div>
      <p class="popup-meta">${m.first_come ? '⚡ <b>선착순 1명</b>만 받을 수 있어요!' : '성공하면 바로 보상!'}
        ${m.expires_at ? `<br>⏰ <span class="timer" data-until="${esc(m.expires_at)}">${countdown(m.expires_at)}</span> 안에` : ''}</p>
      <button class="btn go hot big" data-act="popup-accept" data-id="${m.id}">도전! 💪</button>
      <button class="btn ghost sm" data-act="popup-later" data-id="${m.id}">조금 이따가</button>
    </div></div>`;
}

/* ---------------- 퀘스트 ---------------- */
function questsTab(k) {
  const qs = questsFor(state.data.quests, k.id);
  if (!qs.length) return empty('🗺️', '아직 퀘스트가 없어요', '부모님이 퀘스트를 열어주면 여기 나타나요');
  const rows = qs.map((q) => ({ q, p: questProgress(q, k.id, state.data, today()) }));
  const order = (r) => (r.p.complete && !r.p.claimed ? 0 : r.p.claimed ? 3 : r.p.phase === 'active' ? 1 : 2);
  rows.sort((a, b) => order(a) - order(b));
  return `<h2 class="sec-title">퀘스트</h2><div class="quest-list">${rows.map(questCard).join('')}</div>`;
}

function questCard({ q, p }) {
  let foot;
  if (p.claimed) foot = '<span class="stamp">CLEAR!</span>';
  else if (p.complete && p.phase !== 'upcoming') foot = `<button class="btn go glow" data-act="claim" data-id="${q.id}" data-key="${esc(p.key)}">보상 받기 ${coin(q.reward)}</button>`;
  else if (p.phase === 'upcoming') foot = `<small>${shortDate(p.from)}에 시작해요</small>`;
  else if (p.phase === 'ended') foot = '<small class="muted">기간이 끝났어요</small>';
  else {
    const left = p.remaining;
    foot = `<p class="q-left">${q.goal === 'all' ? `남은 미션 <b>${left}</b>개` : `<b>${left}</b>개 더 하면 클리어!`}
      ${p.pending ? `<small>(확인 중 ${p.pending}개)</small>` : ''}</p>
      <small class="dday">${p.daysLeft === 0 ? '오늘 마감!' : `D-${p.daysLeft}`}</small>`;
  }
  return `<article class="quest ${p.claimed ? 'claimed' : p.complete ? 'ready' : ''}">
    <div class="q-head"><span class="q-emoji">${esc(q.emoji)}</span>
      <div><b>${esc(q.title)}</b><small>${questGoalLabel(q)} · ${esc(p.label)}</small></div>
      <span class="q-reward">${coin(q.reward)}</span></div>
    <div class="q-prog">${progressBar(p.pct, p.complete ? 'full' : '')}<span>${p.done} / ${p.total}</span></div>
    ${q.goal === 'all' && p.total === 0 ? '<small class="muted">이 기간에 해당하는 심부름이 아직 없어요</small>' : ''}
    <div class="q-foot">${foot}</div></article>`;
}

/* ---------------- 상점 ---------------- */
function shopTab(k) {
  const sub = state.ui.shopTab;
  const seg = [
    { id: 'gift', label: '🎁 기프티콘' },
    { id: 'cash', label: '💵 용돈' },
    { id: 'goal', label: '🫙 모으기' },
    { id: 'proxy', label: '🙏 부탁' },
  ];
  return `<div class="seg">${seg.map((s) => `<button class="${sub === s.id ? 'on' : ''}" data-act="shop-tab" data-tab="${s.id}">${s.label}</button>`).join('')}</div>
    ${sub === 'cash' ? cashPane() : sub === 'proxy' ? proxyPane() : sub === 'goal' ? goalPane() : giftPane()}`;
}

function giftPane() {
  const items = state.data.items.filter((i) => i.active).sort((a, b) => a.sort - b.sort || a.price - b.price);
  if (!items.length) return empty('🛍️', '아직 상품이 없어요', '부모님이 상품을 올려주면 여기서 살 수 있어요');
  const b = bal();
  return CATEGORIES.map((c) => {
    const list = items.filter((i) => i.category === c.id);
    if (!list.length) return '';
    return `<h3 class="cat-title">${c.emoji} ${c.label}</h3><div class="gift-grid">${list
      .map((i) => {
        const soldOut = i.stock != null && i.stock <= 0;
        const lack = b < i.price;
        return `<button class="gift ${soldOut ? 'soldout' : ''} ${lack ? 'lack' : ''}" data-act="buy" data-id="${i.id}" ${soldOut ? 'disabled' : ''}>
          <span class="g-emoji">${esc(i.emoji)}</span><b>${esc(i.title)}</b>
          ${coin(i.price)}
          ${soldOut ? '<em class="tag">품절</em>' : i.stock != null ? `<em class="tag">${i.stock}개 남음</em>` : ''}
          ${!soldOut && lack ? `<small>${fmt(i.price - b)}코인 부족</small>` : ''}
        </button>`;
      })
      .join('')}</div>`;
  }).join('');
}

function limitBox(k) {
  if (k.cash_limit == null) return '';
  const used = cashUsedThisMonth(state.data.requests, k.id);
  const left = cashLeft(k, state.data.requests);
  return `<div class="limit-box">
    <div class="limit-row"><span>이번 달 남은 용돈 한도</span><b>${won(left)}</b></div>
    ${progressBar(k.cash_limit ? (used / k.cash_limit) * 100 : 100)}
    <small>한 달에 ${won(k.cash_limit)}까지 바꿀 수 있어요 · 지금까지 ${won(used)}</small></div>`;
}

function cashPane() {
  const rate = state.data.space.coin_rate;
  const k = kid();
  const left = cashLeft(k, state.data.requests);
  const b = Math.min(bal(), Number.isFinite(left) ? Math.floor(left / rate) : Infinity);
  if (Number.isFinite(left) && left < rate) {
    return `<div class="panel cash">${limitBox(k)}
      <p class="limit-done">이번 달 용돈 한도를 다 썼어요!</p>
      <p class="lead">남은 코인은 🎁 기프티콘이나 🫙 같이 모으기에 쓰거나,<br>다음 달까지 모아둘 수 있어요.</p>
      <div class="quick center-row"><button class="chip" data-act="shop-tab" data-tab="gift">🎁 기프티콘 보기</button>
        <button class="chip" data-act="shop-tab" data-tab="goal">🫙 같이 모으기</button></div></div>`;
  }
  return `<div class="panel cash">
    ${limitBox(k)}
    <p class="rate">1코인 = <b>${won(rate)}</b></p>
    <form data-form="cash" class="form">
      <label>바꿀 코인<div class="stepper"><button type="button" data-act="step" data-d="-10">−</button>
        <input name="coins" type="number" inputmode="numeric" min="1" max="${b}" value="${Math.min(b, 10) || ''}" required data-rate="${rate}">
        <button type="button" data-act="step" data-d="10">+</button></div></label>
      <div class="quick">${[10, 50, 100].filter((n) => n <= b).map((n) => `<button type="button" class="chip" data-act="set-coins" data-v="${n}">${n}</button>`).join('')}
        ${b > 0 ? `<button type="button" class="chip" data-act="set-coins" data-v="${b}">전부 (${fmt(b)})</button>` : ''}</div>
      <p class="won-out">받을 용돈 <b data-won>${won(Math.min(b, 10) * rate)}</b></p>
      <button class="btn primary big" ${b <= 0 ? 'disabled' : ''}>용돈으로 바꿔주세요</button>
      <p class="hint">부모님이 용돈을 주시면 '받았어요'로 바뀌어요</p>
    </form></div>`;
}

/* ---------------- 같이 모으기 ---------------- */
const GOAL_STATUS = { open: '모으는 중', full: '다 모았어요! 부모님 기다리는 중', done: '사주셨어요 🎉', canceled: '취소됨' };

export function goalCard(g, { parent = false } = {}) {
  const d = state.data;
  const sum = goalSum(d.ledger, g.id);
  const parts = Object.entries(goalParts(d.ledger, g.id)).filter(([, v]) => v > 0);
  const pct = Math.min(100, (sum / g.target) * 100);
  const maker = kidById(g.kid_id);
  const me = who();
  let foot = '';
  if (parent) {
    if (g.status === 'full') foot += `<button class="btn sm primary" data-act="goal-done" data-id="${g.id}">사줬어요 ✓</button>`;
    if (g.status === 'open' || g.status === 'full') foot += `<button class="link danger" data-act="goal-cancel" data-id="${g.id}">취소(환불)</button>`;
  } else if (g.status === 'open') {
    foot += `<button class="btn sm go" data-act="goal-put" data-id="${g.id}">코인 넣기</button>`;
    if (g.kid_id === me) foot += `<button class="link danger" data-act="goal-cancel" data-id="${g.id}">취소</button>`;
  }
  return `<article class="goal ${g.status}">
    <div class="goal-head"><span class="g-emoji">${esc(g.emoji)}</span>
      <div class="grow"><b>${esc(g.title)}</b><small>${GOAL_STATUS[g.status]}${maker ? ` · ${esc(maker.name)}이(가) 만듦` : ''}</small></div>
      <span class="goal-pct">${Math.floor(pct)}%</span></div>
    <div class="q-prog">${progressBar(pct, g.status !== 'open' ? 'full' : '')}<span>${fmt(sum)} / ${fmt(g.target)}</span></div>
    <div class="goal-parts">${parts.length ? parts.map(([id, v]) => {
      const k = kidById(id);
      return `<span class="goal-part" style="--kc:${esc(k?.color || '#ccc')}">${esc(k?.emoji || '❔')} ${esc(k?.name || '?')} ${fmt(v)}</span>`;
    }).join('') : '<small class="muted">아직 아무도 안 넣었어요</small>'}</div>
    ${foot ? `<div class="goal-foot">${foot}</div>` : ''}</article>`;
}

function goalPane() {
  const gs = [...(state.data.goals || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const live = gs.filter((g) => g.status === 'open' || g.status === 'full');
  const past = gs.filter((g) => g.status === 'done' || g.status === 'canceled').slice(0, 10);
  return `<div class="panel">
      <p class="lead">치킨처럼 혼자 사기 어려운 건<br><b>형제와 코인을 같이 모아요.</b> 다 모이면 부모님께 사달라고 알려줘요.</p>
      <button class="btn primary big full-w" data-act="goal-new">+ 새 목표 만들기</button></div>
    ${live.length ? `<div class="goal-list">${live.map((g) => goalCard(g)).join('')}</div>` : empty('🫙', '모으는 중인 목표가 없어요')}
    ${past.length ? `<details class="later"><summary>지난 목표 ${past.length}개</summary><div class="goal-list">${past.map((g) => goalCard(g)).join('')}</div></details>` : ''}`;
}

function proxyPane() {
  return `<div class="panel">
    <p class="lead">상점에 없거나 내가 직접 살 수 없는 건<br><b>부모님께 코인을 드리고</b> 대신 사달라고 부탁해요.</p>
    <form data-form="proxy" class="form">
      <label>사고 싶은 것<input name="title" type="text" maxlength="40" placeholder="예: 포켓몬 카드 1팩" required></label>
      <label>드릴 코인<input name="coins" type="number" inputmode="numeric" min="1" required></label>
      <label>부모님께 한마디 <small>(선택)</small><textarea name="memo" rows="2" maxlength="200" placeholder="예: 문구점 거 말고 마트 거요!"></textarea></label>
      <button class="btn primary big">코인 드리고 부탁하기</button>
      <p class="hint">거절되면 코인은 그대로 돌려받아요</p>
    </form></div>`;
}

/* ---------------- 지갑 ---------------- */
const REQ_STATUS = {
  pending: { label: '준비 중', cls: 'wait' },
  owned: { label: '쓸 수 있어요', cls: 'ready' },
  using: { label: '부모님 확인 중', cls: 'wait' },
  done: { label: '받았어요', cls: 'done' },
  rejected: { label: '거절 · 코인 돌려받음', cls: 'no' },
  canceled: { label: '취소함', cls: 'no' },
};
const REQ_KIND = { shop: '기프티콘', cash: '용돈 교환', proxy: '부모님께 부탁' };

function walletTab(k) {
  const sub = state.ui.walletTab;
  const reqs = state.data.requests.filter((r) => r.kid_id === k.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ledger = state.data.ledger.filter((l) => l.kid_id === k.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const earned = ledger.filter((l) => l.amount > 0 && l.ref_type !== 'refund').reduce((s, l) => s + l.amount, 0);
  const sibs = sortedKids().filter((x) => x.id !== k.id);
  return `<section class="wallet-card"><small>내 코인</small><div class="big-bal"><i class="coin-ic huge"></i>${fmt(bal())}</div>
      <small>지금까지 모은 코인 ${fmt(earned)}</small>
      ${sibs.length ? `<button class="btn send-btn" data-act="send-open" ${bal() > 0 ? '' : 'disabled'}>💌 코인 보내기</button>` : ''}</section>
    <div class="seg"><button class="${sub === 'coupons' ? 'on' : ''}" data-act="wallet-tab" data-tab="coupons">🎟️ 쿠폰함</button>
      <button class="${sub === 'history' ? 'on' : ''}" data-act="wallet-tab" data-tab="history">📜 코인 내역</button></div>
    ${sub === 'history' ? historyList(ledger) : couponList(reqs)}`;
}

/** 기프티콘(shop) 상태: 예전 방식 '대기'는 '사용 요청'과 같게 봄 */
const couponState = (r) => (r.kind === 'shop' && r.status === 'pending' ? 'using' : r.status);

function couponList(reqs) {
  if (!reqs.length) return empty('🎟️', '아직 산 게 없어요', '상점에서 코인을 써보세요!');
  const ready = reqs.filter((r) => r.kind === 'shop' && couponState(r) === 'owned');
  const waiting = reqs.filter((r) => couponState(r) === 'using' || (r.kind !== 'shop' && r.status === 'pending'));
  const past = reqs.filter((r) => !ready.includes(r) && !waiting.includes(r));
  return `
    <h3 class="cp-title">🎟️ 쓸 수 있는 쿠폰 <span class="count">${ready.length}</span></h3>
    ${ready.length ? `<div class="coupons">${ready.map(readyCoupon).join('')}</div>` : '<p class="muted pad">지금 쓸 수 있는 쿠폰이 없어요</p>'}
    ${waiting.length ? `<h3 class="cp-title">⏳ 부모님 확인 중 <span class="count">${waiting.length}</span></h3><div class="coupons">${waiting.map(waitingCoupon).join('')}</div>` : ''}
    ${past.length ? `<details class="later past"><summary>지난 쿠폰·요청 ${past.length}개</summary><div class="coupons">${past.map(pastCoupon).join('')}</div></details>` : ''}`;
}

const couponHead = (r) => `<div class="c-left"><span>${esc(r.emoji || '🎁')}</span></div>`;

function readyCoupon(r) {
  return `<article class="coupon shop ready">
    ${couponHead(r)}
    <div class="c-main"><small>기프티콘 · ${timeAgo(r.created_at)}에 삼</small><b>${esc(r.title)}</b>
      ${r.parent_note ? `<small class="note">부모님: ${esc(r.parent_note)}</small>` : ''}
      <span class="barcode" aria-hidden="true"></span></div>
    <div class="c-right"><button class="btn go" data-act="coupon-use" data-id="${r.id}">사용하기</button>
      <button class="link" data-act="coupon-refund" data-id="${r.id}">환불</button></div>
  </article>`;
}

function waitingCoupon(r) {
  const shop = r.kind === 'shop';
  return `<article class="coupon ${r.kind} wait">
    ${couponHead(r)}
    <div class="c-main"><small>${shop ? '쿠폰 사용 요청' : REQ_KIND[r.kind]}</small><b>${esc(r.title)}</b>
      ${r.kind === 'cash' ? `<small>${won(r.won)}</small>` : ''}
      ${r.memo ? `<small>“${esc(r.memo)}”</small>` : ''}
      <small class="muted">${timeAgo(r.use_requested_at || r.created_at)} · ${shop ? '부모님이 사주시면 사용 완료돼요' : '부모님이 확인하면 완료돼요'}</small></div>
    <div class="c-right">${coin(r.coins, 'sm')}<span class="st wait">확인 중 ⏳</span>
      <button class="link" data-act="${shop ? 'coupon-unuse' : 'cancel-req'}" data-id="${r.id}">${shop ? '사용 취소' : '취소'}</button></div>
  </article>`;
}

function pastCoupon(r) {
  const used = r.kind === 'shop' && r.status === 'done';
  const st = used ? { label: '사용 완료', cls: 'done' } : r.kind === 'shop' && ['rejected', 'canceled'].includes(r.status)
    ? { label: '환불 · 코인 돌려받음', cls: 'no' } : REQ_STATUS[r.status] || { label: r.status, cls: 'no' };
  return `<article class="coupon ${r.kind} ${st.cls} past">
    ${couponHead(r)}
    <div class="c-main"><small>${r.kind === 'shop' ? '기프티콘' : REQ_KIND[r.kind]}</small><b>${esc(r.title)}</b>
      ${r.kind === 'cash' ? `<small>${won(r.won)}</small>` : ''}
      ${r.parent_note ? `<small class="note">부모님: ${esc(r.parent_note)}</small>` : ''}
      <small class="muted">${timeAgo(r.decided_at || r.created_at)}</small></div>
    <div class="c-right">${coin(r.coins, 'sm')}${used ? '<span class="used-stamp">사용완료</span>' : `<span class="st ${st.cls}">${st.label}</span>`}</div>
  </article>`;
}

function historyList(ledger) {
  if (!ledger.length) return empty('📜', '아직 내역이 없어요');
  return `<ul class="history">${ledger
    .map((l) => `<li><span>${esc(l.reason)}</span><small>${timeAgo(l.created_at)}</small><b class="${l.amount > 0 ? 'plus' : 'minus'}">${l.amount > 0 ? '+' : ''}${fmt(l.amount)}</b></li>`)
    .join('')}</ul>`;
}

/* ---------------- 동작 ---------------- */
const doSubmit = (key) => submitWith(key);

export const actions = {
  'kid-tab': (el) => {
    set({ kidTab: el.dataset.tab });
    window.scrollTo(0, 0);
  },
  'shop-tab': (el) => set({ shopTab: el.dataset.tab }),
  'wallet-tab': (el) => set({ walletTab: el.dataset.tab }),
  submit: (el) => doSubmit(el.dataset.k),
  unsubmit: async (el) => {
    const ok = await confirmDialog({ title: '완료를 취소할까요?', message: '아직 부모님이 확인하기 전이에요.', ok: '취소하기', cancel: '그대로 두기' });
    if (!ok) return;
    const photo = forgetPhotoOf(el.dataset.id);
    if ((await run(() => api.unsubmit(el.dataset.id))) && photo) api.removePhoto(photo).catch(() => {});
  },
  'popup-accept': (el) => {
    prefs.markSeen(who(), el.dataset.id);
    set({ kidTab: 'missions' });
    window.scrollTo(0, 0);
  },
  'popup-later': (el) => {
    prefs.markSeen(who(), el.dataset.id);
    set();
  },
  claim: async (el) => {
    const q = state.data.quests.find((x) => x.id === el.dataset.id);
    const r = await run(() => api.claimQuest(el.dataset.id, who(), el.dataset.key));
    if (r) {
      confetti();
      coinRain(q?.reward || 0, '퀘스트 클리어!');
    }
  },
  buy: async (el) => {
    const it = state.data.items.find((i) => i.id === el.dataset.id);
    if (!it) return;
    const b = bal();
    if (b < it.price) return toast(`코인이 ${fmt(it.price - b)}개 모자라요`, 'err');
    openSheet({
      title: '기프티콘 사기',
      body: `<div class="buy-preview"><span class="g-emoji xl">${esc(it.emoji)}</span><h3>${esc(it.title)}</h3>
        ${it.memo ? `<p>${esc(it.memo)}</p>` : ''}
        <p class="calc">${coin(b)} − ${coin(it.price)} = ${coin(b - it.price)}</p></div>
        <form data-form="buy" class="form"><input type="hidden" name="id" value="${it.id}">
        <p class="hint center">사면 쿠폰이 지갑에 들어가요. 쓰고 싶을 때 <b>사용하기</b>를 누르면 부모님께 알려줘요.</p>
        <button class="btn primary big">${fmt(it.price)}코인으로 사기</button></form>`,
    });
  },
  'coupon-use': async (el) => {
    const r = state.data.requests.find((x) => x.id === el.dataset.id);
    const memo = await confirmDialog({ title: `${r?.emoji || '🎁'} ${r?.title || '쿠폰'} 쓸까요?`, message: '부모님께 사용 요청을 보내요. 부모님이 사주시면 사용 완료돼요.', ok: '사용하기', input: { placeholder: '언제·어떻게 쓰고 싶어요? (선택)' } });
    if (memo == null) return;
    if (await run(() => api.coupon(el.dataset.id, 'use', memo))) toast('부모님께 사용 요청을 보냈어요 🎟️', 'ok');
  },
  'coupon-unuse': async (el) => {
    const ok = await confirmDialog({ title: '사용 요청을 취소할까요?', message: '쿠폰은 다시 "쓸 수 있는 쿠폰"으로 돌아가요.', ok: '요청 취소', cancel: '그대로 두기' });
    if (ok) run(() => api.coupon(el.dataset.id, 'unuse'), '사용 요청을 취소했어요');
  },
  'coupon-refund': async (el) => {
    const r = state.data.requests.find((x) => x.id === el.dataset.id);
    const ok = await confirmDialog({ title: '쿠폰을 환불할까요?', message: `${fmt(r?.coins || 0)}코인을 돌려받고 쿠폰은 사라져요.`, ok: '환불하기', cancel: '그대로 두기', danger: true });
    if (ok) run(() => api.coupon(el.dataset.id, 'refund'), '코인을 돌려받았어요');
  },
  'cancel-req': async (el) => {
    const ok = await confirmDialog({ title: '요청을 취소할까요?', message: '코인은 바로 돌려받아요.', ok: '취소하기', cancel: '그대로 두기' });
    if (ok) run(() => api.decideRequest(el.dataset.id, 'canceled'), '코인을 돌려받았어요');
  },
  'send-open': () => {
    const k = kid();
    const b = bal();
    const sibs = sortedKids().filter((x) => x.id !== k.id);
    openSheet({
      title: '💌 코인 보내기',
      body: `<form data-form="send" class="form">
        <fieldset><legend>누구에게?</legend><div class="kid-pick">${sibs
          .map((s, i) => `<label><input type="radio" name="to" value="${s.id}" ${i === 0 ? 'checked' : ''}><span>${esc(s.emoji)} ${esc(s.name)}</span></label>`)
          .join('')}</div></fieldset>
        <label>보낼 코인 <small>(내 코인 ${fmt(b)})</small><input name="coins" type="number" inputmode="numeric" min="1" max="${b}" required></label>
        <div class="quick">${[10, 50, 100].filter((n) => n <= b).map((n) => `<button type="button" class="chip" data-act="set-coins" data-v="${n}">${n}</button>`).join('')}</div>
        <label>한마디 <small>(선택)</small><input name="memo" type="text" maxlength="40" placeholder="예: 치킨 같이 먹자!"></label>
        <button class="btn primary big">보내기</button>
        <p class="hint">보내면 바로 들어가요. 부모님도 보낸 기록을 볼 수 있어요.</p></form>`,
    });
  },
  'goal-new': () => {
    openSheet({
      title: '🫙 새 목표',
      body: `<form data-form="goal-new" class="form">
        <label>무엇을 모을까요?<input name="title" type="text" maxlength="30" placeholder="예: 치킨" required></label>
        ${emojiPicker('emoji', ['🍗', '🍕', '🍔', '🍦', '🎮', '🧸', '🎬', '🎁', ...ITEM_EMOJIS.filter((e) => !['🍗', '🍕', '🍔', '🍦', '🎮', '🧸', '🎁'].includes(e))], '🍗')}
        <label>목표 코인<input name="target" type="number" inputmode="numeric" min="1" required></label>
        <p class="hint">다 모이면 부모님께 '사주세요' 알림이 가요. 취소하면 넣은 코인은 모두 돌려받아요.</p>
        <button class="btn primary big">만들기</button></form>`,
    });
  },
  'goal-put': (el) => {
    const g = (state.data.goals || []).find((x) => x.id === el.dataset.id);
    if (!g) return;
    const left = g.target - goalSum(state.data.ledger, g.id);
    const b = bal();
    const max = Math.min(left, b);
    if (max <= 0) return toast('코인이 없어요', 'err');
    openSheet({
      title: `${g.emoji} ${g.title}에 넣기`,
      body: `<form data-form="goal-put" class="form"><input type="hidden" name="id" value="${g.id}">
        <p class="center">남은 코인 <b>${fmt(left)}</b> · 내 코인 <b>${fmt(b)}</b></p>
        <label>넣을 코인<input name="coins" type="number" inputmode="numeric" min="1" max="${max}" required></label>
        <div class="quick">${[10, 50, 100].filter((n) => n < max).map((n) => `<button type="button" class="chip" data-act="set-coins" data-v="${n}">${n}</button>`).join('')}
          <button type="button" class="chip" data-act="set-coins" data-v="${max}">${max === left ? '남은 만큼' : '전부'} (${fmt(max)})</button></div>
        <button class="btn primary big">넣기</button></form>`,
    });
  },
  'goal-cancel': async (el) => {
    const g = (state.data.goals || []).find((x) => x.id === el.dataset.id);
    const ok = await confirmDialog({ title: `'${g?.title}' 목표를 취소할까요?`, message: '넣은 코인은 각자에게 돌려줘요.', ok: '취소하기', cancel: '그대로 두기', danger: true });
    if (ok) run(() => api.goalDecide(el.dataset.id, 'canceled'), '취소하고 코인을 돌려줬어요');
  },
  step: (el) => {
    const inp = el.closest('form').querySelector('[name=coins]');
    inp.value = Math.max(1, Math.min(bal(), (Number(inp.value) || 0) + Number(el.dataset.d)));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  },
  'set-coins': (el) => {
    const inp = el.closest('form').querySelector('[name=coins]');
    inp.value = el.dataset.v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  },
};

/** 용돈 교환: 코인 입력하면 원화 바로 계산 */
export function onInput(e) {
  const t = e.target;
  if (t.name === 'coins' && t.dataset.rate) {
    const out = t.closest('form').querySelector('[data-won]');
    if (out) out.textContent = won((Number(t.value) || 0) * Number(t.dataset.rate));
  }
}

export const forms = {
  buy: async (f) => {
    const d = formData(f);
    const r = await run(() => api.createRequest({ kidId: who(), kind: 'shop', itemId: d.id }));
    if (r) {
      closeSheet();
      confetti();
      set({ kidTab: 'wallet', walletTab: 'coupons' });
      toast('쿠폰이 지갑에 들어왔어요! 쓰고 싶을 때 "사용하기" 🎟️', 'ok');
    }
  },
  cash: async (f) => {
    const d = formData(f);
    const coins = Math.floor(Number(d.coins));
    if (!(coins > 0)) return toast('코인을 입력해주세요', 'err');
    const rate = state.data.space.coin_rate;
    const ok = await confirmDialog({ title: `${fmt(coins)}코인을 용돈으로 바꿀까요?`, message: `${won(coins * rate)}을 부모님께 받게 돼요.`, ok: '바꾸기' });
    if (!ok) return;
    const r = await run(() => api.createRequest({ kidId: who(), kind: 'cash', coins }));
    if (r) {
      set({ kidTab: 'wallet', walletTab: 'coupons' });
      toast('부모님께 용돈 요청을 보냈어요 💵', 'ok');
    }
  },
  send: async (f) => {
    const d = formData(f);
    const coins = Math.floor(Number(d.coins));
    const to = kidById(d.to);
    if (!to) return toast('받을 사람을 골라주세요', 'err');
    if (!(coins > 0)) return toast('코인을 입력해주세요', 'err');
    const ok = await confirmDialog({ title: `${to.name}에게 ${fmt(coins)}코인을 보낼까요?`, message: '보내면 되돌릴 수 없어요.', ok: '보내기' });
    if (!ok) return;
    if (await run(() => api.transfer(who(), to.id, coins, d.memo))) {
      closeSheet();
      toast(`${to.name}에게 ${fmt(coins)}코인을 보냈어요 💌`, 'ok');
    }
  },
  'goal-new': async (f) => {
    const d = formData(f);
    const target = Math.floor(Number(d.target));
    if (!(target > 0)) return toast('목표 코인을 입력해주세요', 'err');
    if (await run(() => api.goalCreate(who(), d.title.trim(), d.emoji, target), '목표를 만들었어요')) closeSheet();
  },
  'goal-put': async (f) => {
    const d = formData(f);
    const coins = Math.floor(Number(d.coins));
    if (!(coins > 0)) return toast('코인을 입력해주세요', 'err');
    const g = await run(() => api.goalPut(d.id, who(), coins));
    if (g) {
      closeSheet();
      if (g.status === 'full') {
        confetti();
        toast('🎉 다 모았어요! 부모님께 알렸어요', 'ok');
      } else toast(`${fmt(coins)}코인을 넣었어요`, 'ok');
    }
  },
  proxy: async (f) => {
    const d = formData(f);
    const coins = Math.floor(Number(d.coins));
    if (!(coins > 0)) return toast('코인을 입력해주세요', 'err');
    const ok = await confirmDialog({ title: `${fmt(coins)}코인을 부모님께 드릴까요?`, message: `“${d.title}” 대신 사주기를 부탁해요.`, ok: '부탁하기' });
    if (!ok) return;
    const r = await run(() => api.createRequest({ kidId: who(), kind: 'proxy', title: d.title, coins, memo: d.memo }));
    if (r) {
      set({ kidTab: 'wallet', walletTab: 'coupons' });
      toast('부모님께 부탁했어요 🙏', 'ok');
    }
  },
};
