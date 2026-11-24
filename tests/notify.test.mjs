// 알림 대상/문구 테스트: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, stillCurrent, kstTime } from '../supabase/functions/qc-notify/logic.js';

const kids = [{ id: 'a', name: '하늘' }, { id: 'b', name: '바다' }];
const to = (msgs) => msgs.map((m) => m.to);

test('새 심부름 → 지정된 아이(비어 있으면 모두)', () => {
  const m = { id: 'm', kind: 'chore', title: '설거지', emoji: '🍽️', reward: 20, kid_ids: [] };
  assert.deepEqual(to(plan({ kind: 'mission', row: m }, { kids })), ['a', 'b']);
  const one = plan({ kind: 'mission', row: { ...m, kid_ids: ['b'] } }, { kids });
  assert.deepEqual(to(one), ['b']);
  assert.match(one[0].body, /설거지.*\+20코인/);
});

test('돌발 미션 → 급한 알림 + 선착순 + 마감 시각(한국 시간)', () => {
  const r = { id: 's', kind: 'surprise', title: '택배', emoji: '📦', reward: 30, kid_ids: ['a'], first_come: true, expires_at: '2026-11-23T11:30:00Z' };
  const [msg] = plan({ kind: 'mission', row: r }, { kids });
  assert.equal(msg.urgent, true);
  assert.match(msg.title, /돌발/);
  assert.match(msg.body, /선착순/);
  assert.match(msg.body, /20:30까지/);
  assert.equal(kstTime('2026-11-23T15:05:00Z'), '00:05');
});

test('완료 흐름: 대기 → 부모 / 승인·다시 하기 → 아이 / 자동 적립 → 부모 / 말로 한 심부름 → 아이', () => {
  const mission = { title: '신발 정리', emoji: '👟', kind: 'chore' };
  const s = { id: 's1', kid_id: 'a', reward: 10 };
  let m = plan({ kind: 'submission', row: { ...s, status: 'pending' } }, { kids, mission });
  assert.deepEqual(to(m), ['parents']);
  assert.match(m[0].title, /하늘/);
  assert.doesNotMatch(m[0].body, /사진/);
  assert.match(plan({ kind: 'submission', row: { ...s, status: 'pending', photo_path: 'sp/a/x.jpg' } }, { kids, mission })[0].body, /📷 사진 있음/);
  assert.deepEqual(to(plan({ kind: 'submission', row: { ...s, status: 'approved' }, old_status: 'pending' }, { kids, mission })), ['a']);
  assert.deepEqual(to(plan({ kind: 'submission', row: { ...s, status: 'rejected' }, old_status: 'pending' }, { kids, mission })), ['a']);
  m = plan({ kind: 'submission', row: { ...s, status: 'approved' }, old_status: null }, { kids, mission });
  assert.deepEqual(to(m), ['parents']);
  assert.match(m[0].title, /자동 적립/);
  const quick = { ...mission, kind: 'quick' };
  assert.deepEqual(to(plan({ kind: 'submission', row: { ...s, status: 'approved' }, old_status: null }, { kids, mission: quick })), ['a']);
  assert.deepEqual(to(plan({ kind: 'submission', row: { ...s, status: 'pending' } }, { kids, mission: quick })), []);
});

test('코인 사용 요청: 새 요청 → 부모 / 처리 결과 → 아이', () => {
  const r = { id: 'r', kid_id: 'b', kind: 'cash', title: '용돈 교환', coins: 50, won: 5000 };
  let m = plan({ kind: 'request', row: { ...r, status: 'pending' } }, { kids });
  assert.deepEqual(to(m), ['parents']);
  assert.match(m[0].body, /5,000원/);
  m = plan({ kind: 'request', row: { ...r, status: 'done', parent_note: '잘했어' } }, { kids });
  assert.deepEqual(to(m), ['b']);
  assert.match(m[0].body, /잘했어/);
  m = plan({ kind: 'request', row: { ...r, kind: 'shop', title: '치킨', status: 'rejected' } }, { kids });
  assert.match(m[0].body, /50코인 돌려받음/);
});

test('퀘스트 클리어 → 부모 / 코인 받음·보너스 → 아이 / 같이 모으기', () => {
  assert.deepEqual(to(plan({ kind: 'claim', row: { id: 'c', kid_id: 'a', reward: 100 } }, { kids, quest: { title: '올클리어', emoji: '🏆' } })), ['parents']);
  assert.deepEqual(to(plan({ kind: 'ledger', row: { id: 'l', kid_id: 'b', amount: 3, ref_type: 'transfer', reason: '💌 하늘에게 받음' } }, { kids })), ['b']);
  assert.deepEqual(to(plan({ kind: 'ledger', row: { id: 'l', kid_id: 'b', amount: 3, ref_type: 'submission', reason: 'x' } }, { kids })), []);
  const g = { id: 'g', title: '치킨', emoji: '🍗', target: 300 };
  assert.deepEqual(to(plan({ kind: 'goal', row: { ...g, status: 'full' } }, { kids })), ['parents']);
  assert.deepEqual(to(plan({ kind: 'goal', row: { ...g, status: 'done' } }, { kids, contributors: ['a', 'b'] })), ['a', 'b']);
});

test('그 사이 상태가 바뀐 알림은 건너뜀', () => {
  assert.equal(stillCurrent({ row: { status: 'pending' } }, { status: 'approved' }), false);
  assert.equal(stillCurrent({ row: { status: 'pending' } }, { status: 'pending' }), true);
  assert.equal(stillCurrent({ row: { id: 'x' } }, null), true);
});
