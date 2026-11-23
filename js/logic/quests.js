// 퀘스트 진행도: 주간/월간 '모두 완료' 또는 '심부름 n개'
import { weekStart, addDays, weekKey, monthStart, monthEnd, daysBetween, shortDate } from './dates.js';
import { appliesTo, occurrencesInRange, subFor } from './missions.js';

export function periodOf(q, today) {
  if (q.period === 'month') {
    const from = monthStart(today);
    return { from, to: monthEnd(today), key: today.slice(0, 7), label: `${Number(today.slice(5, 7))}월` };
  }
  if (q.period === 'range') {
    const from = q.start_date || today;
    const to = q.end_date || from;
    return { from, to, key: `range:${from}~${to}`, label: `${shortDate(from)} ~ ${shortDate(to)}` };
  }
  const from = weekStart(today);
  return { from, to: addDays(from, 6), key: weekKey(today), label: '이번 주' };
}

export function questProgress(q, kidId, { missions, submissions, claims }, today) {
  const p = periodOf(q, today);
  let done = 0;
  let pending = 0;
  let total;
  if (q.goal === 'all') {
    const occ = occurrencesInRange(missions, kidId, p.from, p.to, q.mission_ids || []);
    total = occ.length;
    for (const o of occ) {
      const s = subFor(submissions, o.m.id, kidId, o.date);
      if (s?.status === 'approved') done++;
      else if (s?.status === 'pending') pending++;
    }
  } else {
    total = q.target;
    for (const s of submissions) {
      if (s.kid_id !== kidId || s.occurrence_date < p.from || s.occurrence_date > p.to) continue;
      if (s.status === 'approved') done++;
      else if (s.status === 'pending') pending++;
    }
    done = Math.min(done, total);
    pending = Math.min(pending, total - done);
  }
  const complete = total > 0 && done >= total;
  const claimed = claims.some((c) => c.quest_id === q.id && c.kid_id === kidId && c.period_key === p.key);
  const phase = today < p.from ? 'upcoming' : today > p.to ? 'ended' : 'active';
  return {
    ...p, done, pending, total, complete, claimed, phase,
    remaining: Math.max(0, total - done),
    daysLeft: Math.max(0, daysBetween(today, p.to)),
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

export const questsFor = (quests, kidId) => quests.filter((q) => q.active && appliesTo(q, kidId));

export function questGoalLabel(q) {
  const per = q.period === 'month' ? '이번 달' : q.period === 'range' ? '기간 안에' : '이번 주';
  if (q.goal === 'all') return `${per} ${q.mission_ids?.length ? '정해진' : '모든'} 심부름 완료`;
  return `${per} 심부름 ${q.target}개`;
}
