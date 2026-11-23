// 퀘스트 코인 알림 함수: DB 트리거(qc_notify)가 부르면 받을 사람 폰으로 웹 푸시를 보냄
// 배포: GitHub Actions '알림 함수 배포' (supabase functions deploy qc-notify --no-verify-jwt)
// 필요한 비밀값(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)은 '우리 가족' 알림과 같은 것을 그대로 씀
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { plan, stillCurrent } from './logic.js';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const TABLE: Record<string, string> = { submission: 'qc_submissions', request: 'qc_requests', goal: 'qc_goals' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // DB 트리거만 부를 수 있게: DB 에 저장된 비밀값과 비교
  const { data: cfg } = await db.from('qc_notify_config').select('secret').eq('id', 1).maybeSingle();
  if (!cfg || req.headers.get('x-qc-secret') !== cfg.secret) return json({ ok: false, error: 'forbidden' }, 403);

  const ev = await req.json();
  const row = ev?.row;
  if (!row?.space_id) return json({ ok: false, error: 'no row' }, 400);

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

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    msgs.flatMap((m) =>
      (subs || [])
        .filter((s) => (m.to === 'parents' ? s.is_parent : s.kid_id === m.to))
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: m.title, body: m.body, tag: m.tag, urgent: m.urgent }),
              { TTL: m.urgent ? 3600 : 86400, urgency: m.urgent ? 'high' : 'normal' },
            );
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(s.endpoint); // 알림을 끄거나 앱을 지운 기기
            else console.error('push failed', code, (e as { body?: string }).body);
          }
        }),
    ),
  );
  if (dead.length) await db.from('qc_push_subs').delete().in('endpoint', dead);
  return json({ ok: true, sent, removed: dead.length });
});
