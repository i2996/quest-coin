// 코인 잔액 계산
export const balanceOf = (ledger, kidId) => ledger.reduce((sum, l) => (l.kid_id === kidId ? sum + l.amount : sum), 0);
export const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
export const won = (n) => `${fmt(n)}원`;

// 같이 모으기: 아이별로 넣은 코인 (돌려받은 건 빼고)
export function goalParts(ledger, goalId) {
  const by = {};
  for (const l of ledger) {
    if (l.ref_id === goalId && (l.ref_type === 'goal' || l.ref_type === 'refund')) by[l.kid_id] = (by[l.kid_id] || 0) - l.amount;
  }
  return by;
}
export const goalSum = (ledger, goalId) => Object.values(goalParts(ledger, goalId)).reduce((s, v) => s + v, 0);

// 이번 달(이 기기 시간 기준) 용돈 교환에 쓴 금액: 대기 중 + 받은 것
const monthOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const cashUsedThisMonth = (requests, kidId, nowTs = Date.now()) =>
  requests
    .filter((r) => r.kid_id === kidId && r.kind === 'cash' && (r.status === 'pending' || r.status === 'done') && monthOf(r.created_at) === monthOf(nowTs))
    .reduce((s, r) => s + (r.won || 0), 0);
/** 이번 달 남은 용돈 한도(원). 제한 없으면 Infinity */
export const cashLeft = (kid, requests, nowTs = Date.now()) =>
  kid?.cash_limit == null ? Infinity : Math.max(0, kid.cash_limit - cashUsedThisMonth(requests, kid.id, nowTs));
