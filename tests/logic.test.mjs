// 실행: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, weekKey, monthEnd, addDays, countdown } from '../js/logic/dates.js';
import { occursOn, kidToday, kidSurprises, liveSurprises, occurrencesInRange } from '../js/logic/missions.js';
import { questProgress, periodOf } from '../js/logic/quests.js';
import { balanceOf } from '../js/logic/coins.js';

const K = 'kid1';
const chore = (o) => ({ id: o.id, kind: 'chore', active: true, kid_ids: [], repeat: 'none', repeat_days: [], start_date: '2026-11-23', due_date: null, reward: 10, ...o });

test('날짜', () => {
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // 일요일 → 월요일
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekKey('2026-11-23'), '2026-W48');
  assert.equal(weekKey('2027-01-01'), '2026-W53');
  assert.equal(monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(countdown(65_000 + 3600_000, 0), '1:01:05');
});

test('반복 규칙', () => {
  const w = chore({ id: 'w', repeat: 'weekly', repeat_days: [1, 3] }); // 월·수
  assert.equal(occursOn(w, '2026-11-23'), true);
  assert.equal(occursOn(w, '2026-11-24'), false);
  assert.equal(occursOn(w, '2026-11-16'), false); // 시작 전
  assert.equal(occursOn(chore({ id: 'o' }), '2026-11-23'), true);
  assert.equal(occursOn(chore({ id: 'o' }), '2026-11-24'), false);
});

test('오늘 목록: 한 번짜리는 끝낼 때까지, 기한 지나면 숨김', () => {
  const missions = [chore({ id: 'a', due_date: '2026-11-25' }), chore({ id: 'b', repeat: 'daily' }), chore({ id: 'c', kid_ids: ['other'] })];
  let list = kidToday({ missions, submissions: [] }, K, '2026-11-24');
  assert.deepEqual(list.map((x) => x.m.id), ['a', 'b']);
  list = kidToday({ missions, submissions: [] }, K, '2026-11-26');
  assert.deepEqual(list.map((x) => x.m.id), ['b']);
  const subs = [{ mission_id: 'a', kid_id: K, occurrence_date: '2026-11-23', status: 'approved', decided_at: '2026-11-23T10:00:00' }];
  list = kidToday({ missions, submissions: subs }, K, '2026-11-24');
  assert.deepEqual(list.map((x) => x.m.id), ['b']);
});

test('돌발 미션: 선착순·마감', () => {
  const now = new Date('2026-11-23T12:00:00').getTime();
  const m = { id: 's', kind: 'surprise', active: true, kid_ids: [], start_date: '2026-11-23', first_come: true, expires_at: '2026-11-23T13:00:00' };
  let l = kidSurprises({ missions: [m], submissions: [] }, K, now, '2026-11-23');
  assert.equal(liveSurprises(l).length, 1);
  const taken = [{ mission_id: 's', kid_id: 'other', occurrence_date: '2026-11-23', status: 'pending' }];
  l = kidSurprises({ missions: [m], submissions: taken }, K, now, '2026-11-23');
  assert.equal(l.length, 0);
  l = kidSurprises({ missions: [m], submissions: [] }, K, new Date('2026-11-23T14:00:00').getTime(), '2026-11-23');
  assert.equal(l.length, 0);
});

test('퀘스트: 주간 모두 완료 → 남은 미션 수', () => {
  const missions = [chore({ id: 'd', repeat: 'daily' }), chore({ id: 'w', repeat: 'weekly', repeat_days: [6] })];
  const occ = occurrencesInRange(missions, K, '2026-11-23', '2026-11-29');
  assert.equal(occ.length, 8); // 매일 7 + 토요일 1
  const subs = [
    { mission_id: 'd', kid_id: K, occurrence_date: '2026-11-23', status: 'approved' },
    { mission_id: 'd', kid_id: K, occurrence_date: '2026-11-24', status: 'pending' },
  ];
  const q = { id: 'q', goal: 'all', period: 'week', mission_ids: [], kid_ids: [], target: 1 };
  const p = questProgress(q, K, { missions, submissions: subs, claims: [] }, '2026-11-24');
  assert.equal(p.total, 8);
  assert.equal(p.done, 1);
  assert.equal(p.pending, 1);
  assert.equal(p.remaining, 7);
  assert.equal(p.complete, false);
  assert.equal(p.key, '2026-W48');
});

test('퀘스트: 심부름 n개 + 보상 받음 표시', () => {
  const subs = Array.from({ length: 5 }, (_, i) => ({ mission_id: 'x' + i, kid_id: K, occurrence_date: '2026-11-0' + (i + 1), status: 'approved' }));
  const q = { id: 'q', goal: 'count', period: 'month', target: 5, kid_ids: [] };
  const key = periodOf(q, '2026-11-20').key;
  let p = questProgress(q, K, { missions: [], submissions: subs, claims: [] }, '2026-11-20');
  assert.equal(p.complete, true);
  assert.equal(p.claimed, false);
  p = questProgress(q, K, { missions: [], submissions: subs, claims: [{ quest_id: 'q', kid_id: K, period_key: key }] }, '2026-11-20');
  assert.equal(p.claimed, true);
  p = questProgress(q, K, { missions: [], submissions: subs, claims: [] }, '2026-12-01');
  assert.equal(p.done, 0); // 다음 달은 새로 시작
});

test('잔액', () => {
  assert.equal(balanceOf([{ kid_id: K, amount: 50 }, { kid_id: K, amount: -20 }, { kid_id: 'o', amount: 99 }], K), 30);
});

test('말로 시킨 심부름: 오늘 목록에 완료로, 퀘스트 n개에 +1, 모두 완료 퀘스트엔 영향 없음', () => {
  const quick = { id: 'qk', kind: 'quick', active: true, kid_ids: [K], start_date: '2026-11-24', reward: 15 };
  const missions = [chore({ id: 'd', repeat: 'daily' }), quick];
  const subs = [{ mission_id: 'qk', kid_id: K, occurrence_date: '2026-11-24', status: 'approved', decided_at: '2026-11-24T10:00:00' }];
  const list = kidToday({ missions, submissions: subs }, K, '2026-11-24');
  assert.deepEqual(list.map((x) => `${x.m.id}:${x.status}`), ['d:todo', 'qk:approved']);
  assert.equal(kidToday({ missions, submissions: subs }, K, '2026-11-25').some((x) => x.m.id === 'qk'), false);
  const cnt = questProgress({ id: 'c', goal: 'count', period: 'week', target: 3, kid_ids: [] }, K, { missions, submissions: subs, claims: [] }, '2026-11-24');
  assert.equal(cnt.done, 1);
  const all = questProgress({ id: 'a', goal: 'all', period: 'week', mission_ids: [], kid_ids: [] }, K, { missions, submissions: subs, claims: [] }, '2026-11-24');
  assert.equal(all.total, 7); // 매일 심부름 월~일 7개만 (말로 한 건 제외)
});
