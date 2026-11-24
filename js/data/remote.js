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
  claims: 'qc_quest_claims', items: 'qc_shop_items', requests: 'qc_requests', ledger: 'qc_ledger', goals: 'qc_goals',
};

export async function loadAll(spaceId) {
  const q = (t) => db().from(t).select('*').eq('space_id', spaceId).order('created_at', { ascending: true });
  const [space, role, ...rows] = await Promise.all([
    db().from('qc_spaces').select('*').eq('id', spaceId).maybeSingle().then(unwrap),
    rpc('qc_my_role', { p_space_id: spaceId }),
    // qc_goals 는 나중에 추가된 테이블: SQL 을 아직 안 돌렸어도 앱은 열리게
    ...Object.values(TABLES).map((t) => q(t).then((r) => (t === 'qc_goals' && r.error ? [] : unwrap(r)))),
  ]);
  if (!space || !role) return null; // 접근 권한 없음
  const out = { space, role };
  Object.keys(TABLES).forEach((k, i) => (out[k] = rows[i]));
  return out;
}

export function subscribe(spaceId, onChange) {
  const ch = db().channel(`qc-${spaceId}`);
  [...Object.values(TABLES).filter((t) => t !== 'qc_goals'), 'qc_spaces'].forEach((table) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: table === 'qc_spaces' ? `id=eq.${spaceId}` : `space_id=eq.${spaceId}` }, onChange)
  );
  ch.subscribe();
  // 같이 모으기는 따로 구독 (테이블이 아직 없어도 다른 실시간 갱신은 그대로 동작)
  const ch2 = db().channel(`qc-goals-${spaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_goals', filter: `space_id=eq.${spaceId}` }, onChange);
  ch2.subscribe();
  return () => { db().removeChannel(ch); db().removeChannel(ch2); };
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

export const submit = (missionId, kidId, date, photo = null) =>
  rpc('qc_submit', { p_mission_id: missionId, p_kid_id: kidId, p_date: date, p_photo: photo });

// 인증 사진: Storage 'qc-photos' (비공개). 경로 = <공간 id>/<아이 id>/<무작위>.jpg
const BUCKET = 'qc-photos';
export async function uploadPhoto(spaceId, kidId, blob) {
  const path = `${spaceId}/${kidId}/${crypto.randomUUID()}.jpg`;
  const { error } = await db().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message || '')) throw new Error('사진 저장소가 아직 없어요. Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행해주세요.');
    throw new Error('사진을 올리지 못했어요: ' + (error.message || error));
  }
  return path;
}
/** { 경로: 1시간짜리 보기 주소 } */
export async function photoUrls(paths) {
  if (!paths.length) return {};
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}
export const removePhoto = async (path) => { await db().storage.from(BUCKET).remove([path]); };
export const unsubmit = (id) => rpc('qc_unsubmit', { p_id: id });
export const decideSubmission = (id, approve) => rpc('qc_decide_submission', { p_id: id, p_approve: approve });
export const completeFor = (missionId, kidId, date) => rpc('qc_complete_for', { p_mission_id: missionId, p_kid_id: kidId, p_date: date });
export const quickChore = (spaceId, kidIds, title, emoji, reward, date) =>
  rpc('qc_quick_chore', { p_space_id: spaceId, p_kid_ids: kidIds, p_title: title, p_emoji: emoji, p_reward: reward, p_date: date });
export const claimQuest = (questId, kidId, key) => rpc('qc_claim_quest', { p_quest_id: questId, p_kid_id: kidId, p_period_key: key });
export const createRequest = ({ kidId, kind, title = null, coins = null, itemId = null, memo = null }) =>
  rpc('qc_create_request', { p_kid_id: kidId, p_kind: kind, p_title: title, p_coins: coins, p_item_id: itemId, p_memo: memo });
export const decideRequest = (id, status, note = null) => rpc('qc_decide_request', { p_id: id, p_status: status, p_note: note });
export const adjust = (kidId, amount, reason) => rpc('qc_adjust', { p_kid_id: kidId, p_amount: amount, p_reason: reason });
export const transfer = (fromId, toId, coins, memo) => rpc('qc_transfer', { p_from: fromId, p_to: toId, p_coins: coins, p_memo: memo });
export const goalCreate = (kidId, title, emoji, target) => rpc('qc_goal_create', { p_kid_id: kidId, p_title: title, p_emoji: emoji, p_target: target });
export const goalPut = (goalId, kidId, coins) => rpc('qc_goal_put', { p_goal_id: goalId, p_kid_id: kidId, p_coins: coins });
export const goalDecide = (goalId, status) => rpc('qc_goal_decide', { p_goal_id: goalId, p_status: status });

// 폰 알림: 이 기기 구독 저장 (지금 쓰는 사람 = 아이 id 또는 부모)
export function savePush(spaceId, sub, kidId, isParent) {
  const j = sub.toJSON();
  return rpc('qc_push_save', { p_space_id: spaceId, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_kid_id: kidId, p_parent: !!isParent });
}
export const deletePush = (endpoint) => rpc('qc_push_delete', { p_endpoint: endpoint });

/** 앱 '테스트' 버튼: 알림 서버가 이 기기로 실제 알림을 보내 보고 결과(+최근 알림 기록)를 돌려줌 */
export async function serverPushTest(endpoint, delay = 0) {
  const { data, error } = await db().functions.invoke('qc-notify', { body: { kind: 'test', endpoint, delay } });
  if (error) {
    const status = error.context?.status;
    if (status === 404) throw new Error('알림 서버(qc-notify)가 아직 배포되지 않았어요. GitHub Actions 의 \'알림 함수 배포\'를 실행해주세요.');
    throw new Error('알림 서버에 연결하지 못했어요' + (status ? ` (${status})` : '') + ': ' + (error.message || error));
  }
  return data;
}
