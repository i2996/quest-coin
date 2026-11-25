// 퀘스트 코인 알림 함수: DB 트리거(qc_notify)가 부르면 받을 사람 폰으로 웹 푸시를 보냄
// 배포: GitHub Actions '알림 함수 배포' (supabase functions deploy qc-notify --no-verify-jwt)
// 필요한 비밀값(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)은 '우리 가족' 알림과 같은 것을 그대로 씀
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { plan, stillCurrent } from './logic.js';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const TABLE: Record<string, string> = { submission: 'qc_submissions', request: 'qc_requests', goal: 'qc_goals' };

// ---------- 안드로이드 앱 알림 (FCM HTTP v1) ----------
// 비밀값 FCM_SERVICE_ACCOUNT: Firebase 서비스 계정 키(JSON) 전체
let fcmToken: { value: string; exp: number } | null = null;
const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf as ArrayBuffer);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
let fcmPending: Promise<string> | null = null;
function fcmAccess(sa: { client_email: string; private_key: string }): Promise<string> {
  if (fcmToken && fcmToken.exp > Date.now() + 60000) return Promise.resolve(fcmToken.value);
  if (!fcmPending) fcmPending = fcmLogin(sa).finally(() => (fcmPending = null)); // 동시에 여러 번 불려도 로그인은 한 번
  return fcmPending;
}
async function fcmLogin(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('fcm auth failed: ' + JSON.stringify(j).slice(0, 200));
  fcmToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return fcmToken.value;
}
/** 반환: 'ok' | 'dead'(지워야 할 토큰) | 'fail' */
async function sendFcm(sa: any, token: string, m: { title: string; body: string; tag: string; urgent?: boolean }) {
  const access = await fcmAccess(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: m.title, body: m.body },
        data: { tag: m.tag || '' },
        android: { priority: 'HIGH', ttl: m.urgent ? '3600s' : '86400s', notification: { channel_id: 'quest', tag: m.tag || undefined, sound: 'default' } },
      },
    }),
  });
  if (res.ok) return 'ok';
  const t = await res.text();
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(t)) return 'dead';
  console.error('fcm failed', res.status, t.slice(0, 300));
  return 'fail';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // DB 트리거만 부를 수 있게: DB 에 저장된 비밀값과 비교
  const { data: cfg } = await db.from('qc_notify_config').select('secret').eq('id', 1).maybeSingle();
  if (!cfg || req.headers.get('x-qc-secret') !== cfg.secret) return json({ ok: false, error: 'forbidden' }, 403);

  let ev: any;
  try {
    ev = await req.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
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
  const targets = msgs.flatMap((m) => (subs || []).filter((s) => (m.to === 'parents' ? s.is_parent : s.kid_id === m.to)).map((s) => ({ m, s })));
  if (!targets.length) return json({ ok: true, sent: 0, note: 'no subscribed device' });

  // 웹(브라우저) 구독은 웹 푸시, 'fcm:' 구독은 안드로이드 앱 알림
  const webTargets = targets.filter(({ s }) => !s.endpoint.startsWith('fcm:'));
  const appTargets = targets.filter(({ s }) => s.endpoint.startsWith('fcm:'));
  let sent = 0;
  const dead: string[] = [];

  if (appTargets.length) {
    let sa: any = null;
    try {
      sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') || 'null');
    } catch { /* 잘못된 값 */ }
    if (!sa?.private_key) console.error('FCM_SERVICE_ACCOUNT 가 없어서 앱 알림을 못 보냄');
    else {
      await Promise.all(appTargets.map(async ({ m, s }) => {
        try {
          const r = await sendFcm(sa, s.endpoint.slice(4), m);
          if (r === 'ok') sent++;
          else if (r === 'dead') dead.push(s.endpoint);
        } catch (e) {
          console.error('fcm error', (e as Error).message);
        }
      }));
    }
  }

  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (webTargets.length && (!pub || !priv)) console.error('VAPID 키가 없어서 웹 알림을 못 보냄');
  if (webTargets.length && pub && priv) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);

  await Promise.all(
    (pub && priv ? webTargets : []).map(async ({ m, s }) => {
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
  );
  if (dead.length) await db.from('qc_push_subs').delete().in('endpoint', dead);
  return json({ ok: true, sent, removed: dead.length });
});
