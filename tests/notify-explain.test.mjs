// 앱 '알림 점검' 결과 설명 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainTest } from '../js/ui/notify.js';

const name = (id) => ({ a: '하늘', b: '바다' })[id] || '아이';

test('정상: 이 폰 역할 + 등록 현황 + 최근 기록', () => {
  const t = explainTest({ ok: true, as: 'parent', parents: 1, kids: ['a'], log: [{ kind: 'submission', title: '✅ 하늘: 다 했어요!', sent: 1, note: 'ok', created_at: '2026-11-24T09:05:00' }] }, name);
  assert.match(t, /보냈어요/);
  assert.match(t, /"부모님" 알림/);
  assert.match(t, /부모 폰: 1대 · 알림 켠 아이: 하늘/);
  assert.match(t, /11\/24 09:05 ✅ 하늘: 다 했어요! → 1대$/m);
});

test('부모 폰이 아이로 등록돼 있으면 바로 보임', () => {
  const t = explainTest({ ok: true, as: 'a', parents: 0, kids: ['a'], log: [{ kind: 'submission', title: '✅ 하늘: 다 했어요!', sent: 0, note: '알림 켠 부모 기기 없음', created_at: '2026-11-24T09:05:00' }] }, name);
  assert.match(t, /"하늘" 알림/);
  assert.match(t, /부모 폰: 0대/);
  assert.match(t, /→ 0대 \(알림 켠 부모 기기 없음\)/);
});

test('실패 원인 설명', () => {
  assert.match(explainTest({ ok: false, reason: 'no_vapid', log: [] }, name), /VAPID/);
  assert.match(explainTest({ ok: false, reason: 'not_registered' }, name), /껐다가 다시 켜/);
  assert.match(explainTest({ ok: false, reason: 'push_failed', status: 403, error: 'VapidPkHashMismatch' }, name), /한 쌍이 아니에요/);
  assert.match(explainTest({ ok: true, log: [] }, name), /아직 없어요/);
});
