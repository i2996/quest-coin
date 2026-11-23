// Supabase 백엔드 (가족 모두의 폰이 같은 데이터를 봄)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

let sb = null;
const db = () => {
  if (!sb) {
    sb = createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'questCoin.auth' },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return sb;
};

function unwrap({ data, error }) {
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('DB 준비가 안 됐어요. Supabase SQL Editor 에서 supabase/schema.sql 을 실행해주세요.');
    }
    throw new Error(error.message || String(error));
  }
  return data;
}
const rpc = async (fn, args) => unwrap(await db().rpc(fn, args));

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export async function init() {
  const { data } = await db().auth.getSession();
  if (data.session) return;
  unwrap(await db().auth.signInAnonymously());
}

export async function createSpace(name, password, pin) {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db().rpc('qc_create_space', { p_name: name, p_code: genCode(), p_password: password, p_parent_pin: pin });
    if (!error) return data;
    if (error.code !== '23505') unwrap({ error });
  }
  throw new Error('가족 코드를 만들지 못했어요. 다시 시도해주세요.');
}
export const joinSpace = (code, password) => rpc('qc_join_space', { p_code: code, p_password: password });

const TABLES = {
  kids: 'qc_kids', missions: 'qc_missions', submissions: 'qc_submissions', quests: 'qc_quests',
  claims: 'qc_quest_claims', items: 'qc_shop_items', requests: 'qc_requests', ledger: 'qc_ledger',
};

export async function loadAll(spaceId) {
  const q = (t) => db().from(t).select('*').eq('space_id', spaceId).order('created_at', { ascending: true });
  const [space, role, ...rows] = await Promise.all([
    db().from('qc_spaces').select('*').eq('id', spaceId).maybeSingle().then(unwrap),
    rpc('qc_my_role', { p_space_id: spaceId }),
    ...Object.values(TABLES).map((t) => q(t).then(unwrap)),
  ]);
  if (!space || !role) return null; // 접근 권한 없음
  const out = { space, role };
  Object.keys(TABLES).forEach((k, i) => (out[k] = rows[i]));
  return out;
}

export function subscribe(spaceId, onChange) {
  const ch = db().channel(`qc-${spaceId}`);
  [...Object.values(TABLES), 'qc_spaces'].forEach((table) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: table === 'qc_spaces' ? `id=eq.${spaceId}` : `space_id=eq.${spaceId}` }, onChange)
  );
  ch.subscribe();
  return () => db().removeChannel(ch);
}

export const parentLogin = (spaceId, pin) => rpc('qc_parent_login', { p_space_id: spaceId, p_pin: pin });
export const parentLogout = (spaceId) => rpc('qc_parent_logout', { p_space_id: spaceId });
export const changeSecret = (spaceId, which, value) => rpc('qc_change_secret', { p_space_id: spaceId, p_which: which, p_value: value });
export const updateSpace = async (spaceId, patch) => unwrap(await db().from('qc_spaces').update(patch).eq('id', spaceId).select().single());

export async function save(kind, row) {
  const t = TABLES[kind];
  if (row.id) {
    const { id, space_id, created_at, ...patch } = row;
    return unwrap(await db().from(t).update(patch).eq('id', id).select().single());
  }
  return unwrap(await db().from(t).insert(row).select().single());
}
export const remove = async (kind, id) => unwrap(await db().from(TABLES[kind]).delete().eq('id', id));

export const submit = (missionId, kidId, date) => rpc('qc_submit', { p_mission_id: missionId, p_kid_id: kidId, p_date: date });
export const unsubmit = (id) => rpc('qc_unsubmit', { p_id: id });
export const decideSubmission = (id, approve) => rpc('qc_decide_submission', { p_id: id, p_approve: approve });
export const completeFor = (missionId, kidId, date) => rpc('qc_complete_for', { p_mission_id: missionId, p_kid_id: kidId, p_date: date });
export const claimQuest = (questId, kidId, key) => rpc('qc_claim_quest', { p_quest_id: questId, p_kid_id: kidId, p_period_key: key });
export const createRequest = ({ kidId, kind, title = null, coins = null, itemId = null, memo = null }) =>
  rpc('qc_create_request', { p_kid_id: kidId, p_kind: kind, p_title: title, p_coins: coins, p_item_id: itemId, p_memo: memo });
export const decideRequest = (id, status, note = null) => rpc('qc_decide_request', { p_id: id, p_status: status, p_note: note });
export const adjust = (kidId, amount, reason) => rpc('qc_adjust', { p_kid_id: kidId, p_amount: amount, p_reason: reason });
