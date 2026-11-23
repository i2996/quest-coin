// 체험 모드 백엔드: 이 기기(브라우저)에만 저장. Supabase 함수(schema.sql)와 같은 규칙으로 동작.
import { todayISO, addDays } from '../logic/dates.js';
import { balanceOf } from '../logic/coins.js';

const KEY = 'questCoin.demo';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('questCoin.demo') : null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const now = () => new Date().toISOString();

let db = null;
const read = () => {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  return db;
};
const write = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장 공간 없음: 메모리로만 */ }
  chan?.postMessage('changed');
  listeners.forEach((fn) => fn());
};
const listeners = new Set();
chan?.addEventListener('message', () => { db = null; listeners.forEach((fn) => fn()); });

const fail = (msg) => { throw new Error(msg); };
const S = () => read() || fail('체험 데이터가 없어요');
const find = (kind, id) => S()[kind].find((r) => r.id === id);
const addLedger = (kid_id, amount, reason, ref_type = null, ref_id = null) =>
  S().ledger.push({ id: uid(), space_id: S().space.id, kid_id, amount, reason, ref_type, ref_id, created_at: now() });

export async function init() {}

function seed(name, password, pin, withSamples) {
  const space = { id: uid(), code: 'DEMO01', name: name || '우리 집', coin_rate: 100, auto_approve: false, created_at: now() };
  db = { space, role: 'parent', password, pin, kids: [], missions: [], submissions: [], quests: [], claims: [], items: [], requests: [], ledger: [] };
  if (withSamples) {
    const t = todayISO();
    const base = { space_id: space.id, created_at: now(), active: true };
    const k1 = { ...base, id: uid(), name: '하늘', emoji: '🐯', color: '#7c5cff', sort: 0 };
    const k2 = { ...base, id: uid(), name: '바다', emoji: '🐰', color: '#ff7aa8', sort: 1 };
    db.kids.push(k1, k2);
    const m = (o) => ({ ...base, id: uid(), kind: 'chore', memo: null, kid_ids: [], repeat: 'none', repeat_days: [], start_date: t, due_date: null, expires_at: null, first_come: false, ...o });
    db.missions.push(
      m({ title: '신발 정리하기', emoji: '👟', reward: 10, repeat: 'daily' }),
      m({ title: '식탁 수저 놓기', emoji: '🥢', reward: 10, repeat: 'daily' }),
      m({ title: '분리수거 버리기', emoji: '♻️', reward: 30, repeat: 'weekly', repeat_days: [1, 4] }),
      m({ title: '내 방 청소', emoji: '🧹', reward: 50, repeat: 'weekly', repeat_days: [6], kid_ids: [k1.id] }),
      m({ title: '화분에 물 주기', emoji: '🪴', reward: 20, due_date: addDays(t, 2) }),
    );
    const q = (o) => ({ ...base, id: uid(), mission_ids: [], kid_ids: [], start_date: null, end_date: null, ...o });
    db.quests.push(
      q({ title: '이번 주 심부름 올클리어', emoji: '🏆', goal: 'all', target: 1, period: 'week', reward: 100 }),
      q({ title: '심부름 30개 달성', emoji: '🎯', goal: 'count', target: 30, period: 'month', reward: 200 }),
    );
    const it = (o) => ({ ...base, id: uid(), memo: null, stock: null, sort: 0, ...o });
    db.items.push(
      it({ title: '젤리 한 봉지', emoji: '🍬', category: 'snack', price: 30 }),
      it({ title: '아이스크림', emoji: '🍦', category: 'snack', price: 40 }),
      it({ title: '치킨 한 마리', emoji: '🍗', category: 'delivery', price: 300, memo: '주말 저녁에 시켜줄게요' }),
      it({ title: '피자 한 판', emoji: '🍕', category: 'delivery', price: 350 }),
      it({ title: '게임 30분 추가', emoji: '🎮', category: 'etc', price: 50, stock: 3 }),
    );
    addLedger(k1.id, 120, '시작 선물 🎁');
    addLedger(k2.id, 80, '시작 선물 🎁');
  }
  write();
  return space;
}

export async function createSpace(name, password, pin) {
  return seed(name, password, pin, false);
}
/** 체험 모드: 예시 데이터로 바로 시작 */
export async function startDemo() {
  return seed('체험 가족', '0000', '0000', true);
}
export async function joinSpace() {
  const d = read();
  if (!d) fail('체험 모드는 이 기기에서만 쓸 수 있어요');
  return d.space;
}

export async function loadAll(spaceId) {
  const d = read();
  if (!d || d.space.id !== spaceId) return null;
  return structuredClone({ space: d.space, role: d.role, kids: d.kids, missions: d.missions, submissions: d.submissions, quests: d.quests, claims: d.claims, items: d.items, requests: d.requests, ledger: d.ledger });
}
export function subscribe(_spaceId, onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export async function parentLogin(_s, pin) {
  if (pin !== S().pin) return false;
  S().role = 'parent';
  write();
  return true;
}
export async function parentLogout() { S().role = 'member'; write(); }
const needParent = () => S().role === 'parent' || fail('부모만 할 수 있어요');
export async function changeSecret(_s, which, value) {
  needParent();
  if (String(value || '').length < 4) fail('4자 이상 입력해주세요');
  S()[which === 'pin' ? 'pin' : 'password'] = value;
  write();
}
export async function updateSpace(_s, patch) { needParent(); Object.assign(S().space, patch); write(); return S().space; }

export async function save(kind, row) {
  needParent();
  const list = S()[kind];
  if (row.id) {
    const cur = list.find((r) => r.id === row.id) || fail('찾을 수 없어요');
    Object.assign(cur, row);
    write();
    return cur;
  }
  const r = { active: true, sort: 0, kid_ids: [], ...row, id: uid(), space_id: S().space.id, created_at: now() };
  list.push(r);
  write();
  return r;
}
export async function remove(kind, id) {
  needParent();
  const d = S();
  d[kind] = d[kind].filter((r) => r.id !== id);
  // 연결된 기록도 같이 정리 (DB 의 on delete cascade 와 같게)
  if (kind === 'kids') ['submissions', 'claims', 'requests', 'ledger'].forEach((k) => (d[k] = d[k].filter((r) => r.kid_id !== id)));
  if (kind === 'missions') d.submissions = d.submissions.filter((r) => r.mission_id !== id);
  if (kind === 'quests') d.claims = d.claims.filter((r) => r.quest_id !== id);
  write();
}

export async function submit(missionId, kidId, date) {
  const d = S();
  const m = find('missions', missionId) || fail('미션을 찾을 수 없어요');
  if (m.kid_ids.length && !m.kid_ids.includes(kidId)) fail('이 아이의 미션이 아니에요');
  if (!m.active) fail('끝난 미션이에요');
  if (m.kind === 'surprise') {
    if (m.expires_at && new Date(m.expires_at) < new Date()) fail('시간이 지났어요 ⏰');
    if (m.first_come && d.submissions.some((s) => s.mission_id === m.id && s.kid_id !== kidId && s.status !== 'rejected'))
      fail('아쉽게도 다른 친구가 먼저 해냈어요!');
  }
  const st = d.space.auto_approve ? 'approved' : 'pending';
  let s = d.submissions.find((x) => x.mission_id === m.id && x.kid_id === kidId && x.occurrence_date === date);
  if (s && s.status !== 'rejected') fail('이미 완료한 미션이에요');
  if (!s) {
    s = { id: uid(), space_id: d.space.id, mission_id: m.id, kid_id: kidId, occurrence_date: date };
    d.submissions.push(s);
  }
  Object.assign(s, { status: st, reward: m.reward, created_at: now(), decided_at: st === 'approved' ? now() : null });
  if (st === 'approved' && m.reward > 0) addLedger(kidId, m.reward, m.title, 'submission', s.id);
  write();
  return s;
}
export async function unsubmit(id) {
  const d = S();
  const s = find('submissions', id) || fail('기록을 찾을 수 없어요');
  if (s.status !== 'pending') fail('이미 확인이 끝났어요');
  d.submissions = d.submissions.filter((x) => x.id !== id);
  write();
}
export async function decideSubmission(id, approve) {
  needParent();
  const s = find('submissions', id) || fail('기록을 찾을 수 없어요');
  if (s.status !== 'pending') return s;
  s.status = approve ? 'approved' : 'rejected';
  s.decided_at = now();
  if (approve && s.reward > 0) addLedger(s.kid_id, s.reward, find('missions', s.mission_id)?.title || '미션', 'submission', s.id);
  write();
  return s;
}
export async function completeFor(missionId, kidId, date) {
  needParent();
  const d = S();
  const m = find('missions', missionId) || fail('미션을 찾을 수 없어요');
  let s = d.submissions.find((x) => x.mission_id === m.id && x.kid_id === kidId && x.occurrence_date === date);
  if (!s) {
    s = { id: uid(), space_id: d.space.id, mission_id: m.id, kid_id: kidId, occurrence_date: date, created_at: now() };
    d.submissions.push(s);
  }
  if (s.status === 'approved') return s;
  Object.assign(s, { status: 'pending', reward: m.reward });
  return decideSubmission(s.id, true);
}
export async function quickChore(_s, kidIds, title, emoji, reward, date) {
  needParent();
  const d = S();
  title = String(title || '').trim();
  if (!title) fail('무슨 심부름인지 적어주세요');
  if (!kidIds?.length) fail('누가 했는지 골라주세요');
  reward = Math.max(0, Number(reward) || 0);
  const m = { id: uid(), space_id: d.space.id, kind: 'quick', title, emoji: emoji || '✍️', reward, memo: null, kid_ids: kidIds,
    repeat: 'none', repeat_days: [], start_date: date, due_date: null, expires_at: null, first_come: false, active: true, created_at: now() };
  d.missions.push(m);
  for (const k of kidIds) {
    find('kids', k) || fail('아이를 찾을 수 없어요');
    const s = { id: uid(), space_id: d.space.id, mission_id: m.id, kid_id: k, occurrence_date: date, status: 'approved', reward, created_at: now(), decided_at: now() };
    d.submissions.push(s);
    if (reward > 0) addLedger(k, reward, title, 'submission', m.id);
  }
  write();
  return kidIds.length;
}
export async function claimQuest(questId, kidId, key) {
  const d = S();
  const q = find('quests', questId) || fail('퀘스트를 찾을 수 없어요');
  if (d.claims.some((c) => c.quest_id === questId && c.kid_id === kidId && c.period_key === key)) fail('이미 보상을 받았어요');
  const c = { id: uid(), space_id: d.space.id, quest_id: questId, kid_id: kidId, period_key: key, reward: q.reward, created_at: now() };
  d.claims.push(c);
  if (q.reward > 0) addLedger(kidId, q.reward, '퀘스트 · ' + q.title, 'quest', c.id);
  write();
  return c;
}
export async function createRequest({ kidId, kind, title = null, coins = null, itemId = null, memo = null }) {
  const d = S();
  find('kids', kidId) || fail('아이를 찾을 수 없어요');
  let it = null;
  let emoji = null;
  let won = null;
  title = String(title || '').trim();
  if (kind === 'shop') {
    it = find('items', itemId);
    if (!it || !it.active) fail('판매하지 않는 상품이에요');
    if (it.stock != null && it.stock <= 0) fail('품절이에요');
    title = it.title; coins = it.price; emoji = it.emoji;
  } else if (kind === 'cash') {
    title = '용돈 교환'; emoji = '💵'; won = coins * d.space.coin_rate;
  } else if (kind === 'proxy') {
    if (!title) fail('무엇을 사고 싶은지 적어주세요');
    emoji = '🙏';
  } else fail('알 수 없는 요청');
  if (!(coins > 0)) fail('코인을 1개 이상 입력해주세요');
  if (balanceOf(d.ledger, kidId) < coins) fail('코인이 모자라요');
  if (it && it.stock != null) it.stock -= 1;
  const r = { id: uid(), space_id: d.space.id, kid_id: kidId, kind, title, emoji, coins, won, item_id: it?.id ?? null,
    memo: String(memo || '').trim() || null, status: 'pending', parent_note: null, created_at: now(), decided_at: null };
  d.requests.push(r);
  addLedger(kidId, -coins, kind === 'shop' ? '기프티콘 · ' + title : kind === 'cash' ? '용돈 교환' : '부모님께 지불 · ' + title, 'request', r.id);
  write();
  return r;
}
export async function decideRequest(id, status, note = null) {
  const d = S();
  const r = find('requests', id) || fail('요청을 찾을 수 없어요');
  if (status !== 'canceled') needParent();
  if (r.status !== 'pending') fail('이미 처리된 요청이에요');
  Object.assign(r, { status, parent_note: String(note || '').trim() || null, decided_at: now() });
  if (status === 'rejected' || status === 'canceled') {
    addLedger(r.kid_id, r.coins, (status === 'rejected' ? '돌려받음 · ' : '취소 · ') + r.title, 'refund', r.id);
    const it = r.kind === 'shop' && find('items', r.item_id);
    if (it && it.stock != null) it.stock += 1;
  }
  write();
  return r;
}
export async function adjust(kidId, amount, reason) {
  needParent();
  if (!amount) fail('0 이 아닌 숫자를 입력해주세요');
  addLedger(kidId, amount, String(reason || '').trim() || (amount > 0 ? '보너스' : '차감'), 'adjust');
  write();
}

export function wipe() {
  db = null;
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
