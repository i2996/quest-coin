// 코인 잔액 계산
export const balanceOf = (ledger, kidId) => ledger.reduce((sum, l) => (l.kid_id === kidId ? sum + l.amount : sum), 0);
export const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
export const won = (n) => `${fmt(n)}원`;
