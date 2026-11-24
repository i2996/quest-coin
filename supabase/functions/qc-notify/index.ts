// 퀘스트 코인 알림 함수
//  1) DB 트리거(qc_notify)가 부르면 받을 사람 폰으로 웹 푸시를 보냄 (x-qc-secret 로 확인)
//  2) 앱의 '테스트' 버튼이 부르면(로그인 토큰으로 확인) 그 기기로 실제 알림을 보내고, 무엇이 문제인지 알려줌
// 배포: GitHub Actions '알림 함수 배포' (supabase functions deploy qc-notify --no-verify-jwt)
// 필요한 비밀값(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)은 '우리 가족' 알림과 같은 것을 그대로 씀
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { plan, stillCurrent } from './logic.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const TABLE: Record<string, string> = { submission: 'qc_submissions', request: 'qc_requests', goal: 'qc_goals' };
type Sub = { endpoint: string; p256dh: string; auth: string; kid_id?: string | null; is_parent?: boolean };

/** VAPID 준비. 없으면 이유 문자열 */
function vapid(): string | null {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return 'no_vapid';
  try {
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);
    return null;
  } catch (e) {
    return 'bad_vapid: ' + (e as Error).message;
  }
}

async function send(s: Sub, payload: object, urgent = false) {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(payload),
      { TTL: urgent ? 3600 : 86400, urgency: urgent ? 'high' : 'normal' },
    );
    return { ok: true as const };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    return { ok: false as const, status: err.statusCode ?? 0, error: String(err.body || err.message || e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let ev: any;
  try {
    ev = await req.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }

  // ---------- 앱의 '테스트' 버튼 ----------
  if (ev?.kind === 'test') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ ok: false, reason: 'not_logged_in' });
    const { data: sub } = await db.from('qc_push_subs').select('*').eq('endpoint', ev.endpoint || '').eq('user_id', u.user.id).maybeSingle();
    if (!sub) return json({ ok: false, reason: 'not_registered' });
    const { data: all } = await db.from('qc_push_subs').select('kid_id,is_parent').eq('space_id', sub.space_id);
    const { data: log } = await db.from('qc_notify_log').select('kind,title,sent,note,created_at').eq('space_id', sub.space_id)
      .order('created_at', { ascending: false }).limit(5);
    const info = {
      as: sub.is_parent ? 'parent' : sub.kid_id,
      parents: (all || []).filter((x) => x.is_parent).length,
      kids: [...new Set((all || []).filter((x) => x.kid_id).map((x) => x.kid_id))],
      log: log || [],
    };
    const v = vapid();
    if (v) return json({ ok: false, reason: v, ...info });
    const payload = { title: '🔔 서버 알림 테스트', body: '이 알림이 보이면 알림 서버가 잘 동작하는 거예요!', tag: 'server-test' };
    const delay = Math.min(Math.max(Number(ev.delay) || 0, 0), 30);
    if (delay) {
      // 앱을 닫고 기다리는 테스트: 바로 대답하고, 뒤에서 delay 초 뒤 보냄
      const later = (async () => {
        await new Promise((r) => setTimeout(r, delay * 1000));
        const r = await send(sub, { ...payload, title: `🔔 서버 알림 테스트 (${delay}초 뒤)` });
        // 다음 점검 때 '보냈는지'를 확인할 수 있게 기록
        await db.from('qc_notify_log').insert({
          space_id: sub.space_id, kind: 'test', title: `🔔 ${delay}초 뒤 테스트`, sent: r.ok ? 1 : 0,
          note: r.ok ? 'ok' : `실패 ${r.status} ${r.error}`.slice(0, 300),
        });
      })();
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(later);
      else await later;
      return json({ ok: true, scheduled: delay, ...info });
    }
    const r = await send(sub, payload);
    if (!r.ok && (r.status === 404 || r.status === 410)) await db.from('qc_push_subs').delete().eq('endpoint', sub.endpoint);
    return json(r.ok ? { ok: true, ...info } : { ok: false, reason: 'push_failed', status: r.status, error: r.error, ...info });
  }

  // ---------- DB 트리거 ----------
  // DB 트리거만 부를 수 있게: DB 에 저장된 비밀값과 비교
  const { data: cfg } = await db.from('qc_notify_config').select('secret').eq('id', 1).maybeSingle();
  if (!cfg || req.headers.get('x-qc-secret') !== cfg.secret) {
    if (ev?.row?.space_id && /^[0-9a-f-]{36}$/.test(ev.row.space_id)) {
      await db.from('qc_notify_log').insert({ space_id: ev.row.space_id, kind: ev.kind, sent: 0, note: cfg ? '거부: 비밀값 불일치' : '거부: qc_notify_config 없음' });
    }
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const row = ev?.row;
  if (!row?.space_id) return json({ ok: false, error: 'no row' }, 400);
  const logIt = async (title: string | null, sent: number, note: string) => {
    await db.from('qc_notify_log').insert({ space_id: row.space_id, kind: ev.kind, title, sent, note: note.slice(0, 300) });
    await db.from('qc_notify_log').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
  };

  // 그 사이 상태가 바뀌었으면 건너뜀
  if (TABLE[ev.kind] && row.id) {
    const { data: cur } = await db.from(TABLE[ev.kind]).select('status').eq('id', row.id).maybeSingle();
    if (!stillCurrent(ev, cur)) return json({ ok: true, sent: 0, note: 'stale' });
  }

  const ctx: Record<string, unknown> = {};
  const { data: kids } = await db.from('qc_kids').select('id,name').eq('space_id', row.space_id);
  ctx.kids = kids || [];
  if (ev.kind === 'submission') ctx.mission = (await db.from('qc_missions').select('title,emoji,kind').eq('id', row.mission_id).maybeSingle()).data;
  if (ev.kind === 'claim') ctx.quest = (await db.from('qc_quests').select('title,emoji').eq('id', row.quest_id).maybeSingle()).data;
  if (ev.kind === 'goal' && row.status === 'done') {
    const { data } = await db.from('qc_ledger').select('kid_id').eq('ref_id', row.id).eq('ref_type', 'goal');
    ctx.contributors = [...new Set((data || []).map((x: { kid_id: string }) => x.kid_id))];
  }

  const msgs = plan(ev, ctx);
  if (!msgs.length) return json({ ok: true, sent: 0, note: 'nothing to send' });

  const { data: subs, error } = await db.from('qc_push_subs').select('endpoint,p256dh,auth,kid_id,is_parent').eq('space_id', row.space_id);
  if (error) return json({ ok: false, error: error.message }, 500);

  const targets = msgs.flatMap((m) => (subs || []).filter((s) => (m.to === 'parents' ? s.is_parent : s.kid_id === m.to)).map((s) => ({ m, s })));
  const title = msgs[0].title;
  if (!targets.length) {
    await logIt(title, 0, msgs.some((m) => m.to === 'parents') ? '알림 켠 부모 기기 없음' : '알림 켠 아이 기기 없음');
    return json({ ok: true, sent: 0, note: 'no subscribed device' });
  }
  const v = vapid();
  if (v) {
    await logIt(title, 0, v);
    return json({ ok: false, error: v }, 500);
  }

  let sent = 0;
  const dead: string[] = [];
  const errs: string[] = [];
  await Promise.all(
    targets.map(async ({ m, s }) => {
      const r = await send(s, { title: m.title, body: m.body, tag: m.tag, urgent: m.urgent }, m.urgent);
      if (r.ok) sent++;
      else if (r.status === 404 || r.status === 410) dead.push(s.endpoint); // 알림을 끄거나 앱을 지운 기기
      else errs.push(`${r.status} ${r.error}`);
    }),
  );
  if (dead.length) await db.from('qc_push_subs').delete().in('endpoint', dead);
  await logIt(title, sent, errs.length ? '실패: ' + errs[0] : dead.length ? `끊긴 기기 ${dead.length}개 정리` : 'ok');
  return json({ ok: true, sent, removed: dead.length, errors: errs.length });
});
