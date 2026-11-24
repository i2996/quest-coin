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

import { explainDevice } from '../js/ui/notify.js';

test('폰 쪽 점검: 도착·미도착·옛 버전', () => {
  assert.match(explainDevice({ serverOk: true, received: { at: 1, error: null }, seconds: 2, ios: true }), /2초 만에 .* 띄웠어요[\s\S]*집중 모드/);
  assert.match(explainDevice({ serverOk: true, received: { at: 1, error: 'TypeError: renotify' }, seconds: 1 }), /추가 옵션 없이 다시 띄웠어요/);
  assert.match(explainDevice({ serverOk: true, received: { at: 1, error: 'a / b' }, seconds: 1 }), /띄우지 못했어요/);
  assert.match(explainDevice({ serverOk: true, received: null, ios: true, standalone: true }), /도착하지 않았어요[\s\S]*홈 화면에 추가/);
  assert.match(explainDevice({ serverOk: true, received: null, ios: true, standalone: false }), /홈 화면에 추가한 앱에서/);
  assert.match(explainDevice({ serverOk: false, swVer: 'quest-coin-v5', latest: 'quest-coin-v8' }), /옛 버전/);
  assert.equal(explainDevice({ serverOk: false, swVer: 'v8', latest: 'v8' }), '');
});

test('지난번에 받은 서버 알림 시각 표시', () => {
  const at = new Date(2026, 10, 24, 17, 45, 10).getTime();
  assert.match(explainDevice({ serverOk: false, prevLast: { at, title: '🔔 서버 알림 테스트 (10초 뒤)', error: null } }), /마지막으로 받은 서버 알림: 11\/24 17:45:10 "🔔 서버 알림 테스트 \(10초 뒤\)"$/);
  assert.match(explainDevice({ serverOk: false, prevLast: { at, title: 'x', error: 'a / b' } }), /화면에 띄우지 못함/);
});

import { deviceGuide } from '../js/ui/notify.js';
test('폰/브라우저별 알림 허용 방법', () => {
  assert.match(deviceGuide('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36'), /삼성 인터넷[\s\S]*퀘스트코인/);
  assert.match(deviceGuide('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'), /크롬/);
  assert.match(deviceGuide('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), /홈 화면에 추가/);
});
