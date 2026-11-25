// 폰/브라우저별 알림 허용 안내 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceGuide } from '../js/ui/notify.js';
test('폰/브라우저별 알림 허용 방법', () => {
  assert.match(deviceGuide('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36'), /삼성 인터넷[\s\S]*퀘스트코인/);
  assert.match(deviceGuide('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'), /크롬/);
  assert.match(deviceGuide('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), /홈 화면에 추가/);
});
