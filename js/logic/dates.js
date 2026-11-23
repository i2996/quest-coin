// 날짜 계산 (모두 기기 현지 시간, 'YYYY-MM-DD' 문자열)
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const weekday = (iso) => parseISO(iso).getDay(); // 0=일
/** 월요일 시작 주 */
export const weekStart = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));
export const monthStart = (iso) => iso.slice(0, 8) + '01';
export const monthEnd = (iso) => {
  const d = parseISO(monthStart(iso));
  d.setMonth(d.getMonth() + 1, 0);
  return toISO(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
/** ISO 주차 키 (예: 2026-W48) */
export function weekKey(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // 그 주의 목요일
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const w = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${pad(w)}`;
}
export const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const shortDate = (iso) => {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
export const dateLabel = (iso) => `${shortDate(iso)}(${WD[weekday(iso)]})`;
export const timeAgo = (ts, nowMs = Date.now()) => {
  const s = Math.max(0, Math.round((nowMs - new Date(ts)) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return shortDate(toISO(new Date(ts)));
};
/** 남은 시간 '1:05:09' / '4:09' */
export function countdown(untilTs, nowMs = Date.now()) {
  let s = Math.max(0, Math.floor((new Date(untilTs) - nowMs) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
