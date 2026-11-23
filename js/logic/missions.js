// 심부름/돌발 미션: 날짜별로 해야 할 것 계산 (DB·화면을 모르는 순수 함수)
import { weekday, eachDay, toISO, addDays, weekStart } from './dates.js';

export const appliesTo = (x, kidId) => !x.kid_ids || x.kid_ids.length === 0 || x.kid_ids.includes(kidId);
export const isRecurring = (m) => m.repeat === 'daily' || m.repeat === 'weekly';

/** 이 날짜에 해야 하는 심부름인가 (반복 없는 것은 시작일 하루가 '그 날짜') */
export function occursOn(m, date) {
  if (m.kind !== 'chore' || date < m.start_date) return false;
  if (m.repeat === 'daily') return true;
  if (m.repeat === 'weekly') return (m.repeat_days || []).includes(weekday(date));
  return date === m.start_date;
}

export const subFor = (subs, missionId, kidId, date) =>
  subs.find((s) => s.mission_id === missionId && s.kid_id === kidId && s.occurrence_date === date) || null;

export const statusOf = (sub) => (sub ? sub.status : 'todo'); // todo | pending | approved | rejected
const ORDER = { todo: 0, rejected: 0, pending: 1, approved: 2 };
const dayOf = (ts) => (ts ? toISO(new Date(ts)) : null);

/** 오늘 이 아이가 할 심부름 목록 */
export function kidToday({ missions, submissions }, kidId, today) {
  const out = [];
  for (const m of missions) {
    if (m.kind !== 'chore' || !m.active || !appliesTo(m, kidId)) continue;
    if (isRecurring(m)) {
      if (!occursOn(m, today)) continue;
      const sub = subFor(submissions, m.id, kidId, today);
      out.push({ m, date: today, sub, status: statusOf(sub) });
    } else {
      if (m.start_date > today) continue;
      const sub = subFor(submissions, m.id, kidId, m.start_date);
      const st = statusOf(sub);
      if (st === 'approved' && dayOf(sub.decided_at || sub.created_at) !== today) continue; // 지난번에 끝낸 것
      if (st !== 'approved' && st !== 'pending' && m.due_date && today > m.due_date) continue; // 기한 지남
      out.push({ m, date: m.start_date, sub, status: st, dueSoon: m.due_date ? m.due_date : null });
    }
  }
  return out.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}

/** 이번 주 남은 날(내일~일요일)의 요일 반복 심부름 */
export function kidLaterThisWeek({ missions }, kidId, today) {
  const end = addDays(weekStart(today), 6);
  const out = [];
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) {
    for (const m of missions) {
      if (m.kind === 'chore' && m.active && m.repeat === 'weekly' && appliesTo(m, kidId) && occursOn(m, d)) out.push({ m, date: d });
    }
  }
  return out;
}

/** 이 아이에게 보이는 돌발 미션 */
export function kidSurprises({ missions, submissions }, kidId, nowMs, today) {
  const out = [];
  for (const m of missions) {
    if (m.kind !== 'surprise' || !m.active || !appliesTo(m, kidId)) continue;
    const date = m.start_date;
    const sub = subFor(submissions, m.id, kidId, date);
    const expired = !!m.expires_at && new Date(m.expires_at).getTime() <= nowMs;
    const taken = m.first_come
      ? submissions.find((s) => s.mission_id === m.id && s.kid_id !== kidId && s.status !== 'rejected') || null
      : null;
    const st = statusOf(sub);
    if (st === 'approved') {
      if (dayOf(sub.decided_at || sub.created_at) !== today) continue;
    } else if (st !== 'pending' && (expired || taken)) {
      continue; // 놓친 돌발 미션은 숨김
    }
    out.push({ m, date, sub, status: st, expired, taken });
  }
  return out;
}

/** 아직 도전 안 한 '살아 있는' 돌발 미션 (팝업용) */
export const liveSurprises = (list) => list.filter((x) => (x.status === 'todo' || x.status === 'rejected') && !x.expired && !x.taken);

/** 기간 안에 이 아이가 해야 하는 심부름 (퀘스트 '모두 완료' 계산용) */
export function occurrencesInRange(missions, kidId, from, to, onlyIds = []) {
  const out = [];
  for (const m of missions) {
    if (m.kind !== 'chore' || !m.active || !appliesTo(m, kidId)) continue;
    if (onlyIds.length && !onlyIds.includes(m.id)) continue;
    if (isRecurring(m)) {
      const start = from > m.start_date ? from : m.start_date;
      for (const d of eachDay(start, to)) if (occursOn(m, d)) out.push({ m, date: d });
    } else if (m.start_date >= from && m.start_date <= to) {
      out.push({ m, date: m.start_date });
    }
  }
  return out;
}

export const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 0];
export function repeatLabel(m) {
  if (m.repeat === 'daily') return '매일';
  if (m.repeat === 'weekly') {
    const days = DAY_CHOICES.filter((d) => (m.repeat_days || []).includes(d));
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return '평일마다';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return '주말마다';
    return '매주 ' + days.map((d) => '일월화수목금토'[d]).join('·');
  }
  return '한 번';
}
