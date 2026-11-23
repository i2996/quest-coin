// 기기별 설정 (localStorage). 읽기/쓰기가 막힌 브라우저에서도 앱은 동작하도록 모두 try/catch.
const P = 'questCoin.';
const get = (k, d = null) => {
  try {
    const v = localStorage.getItem(P + k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const put = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(P + k);
    else localStorage.setItem(P + k, JSON.stringify(v));
  } catch { /* 무시 */ }
};

export const prefs = {
  /** { id, mode: 'remote' | 'demo' } */
  getSpace: () => get('space'),
  setSpace: (v) => put('space', v),
  /** 이 기기를 쓰는 사람: 'parent' 또는 아이 id */
  getWho: () => get('who'),
  setWho: (v) => put('who', v),
  /** 이미 본 돌발 미션 팝업 */
  seen: (kidId) => get('seen.' + kidId, []),
  markSeen: (kidId, id) => put('seen.' + kidId, [...get('seen.' + kidId, []).filter((x) => x !== id).slice(-50), id]),
  /** 코인이 늘었을 때 축하 애니메이션용 */
  lastBalance: (kidId) => get('bal.' + kidId),
  setLastBalance: (kidId, n) => put('bal.' + kidId, n),
};
