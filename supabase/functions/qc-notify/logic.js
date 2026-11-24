// 알림 대상/문구 계산 (순수 함수 — Deno(알림 함수)와 Node(테스트) 어디서나 동작)
// 반환: [{ to: 'parents' | <아이 id>, title, body, tag, urgent? }]

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

/** 한국 시간 'HH:MM' */
export function kstTime(ts) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}

const kidsOf = (ids, kids) => (Array.isArray(ids) && ids.length ? kids.filter((k) => ids.includes(k.id)) : kids);

/**
 * @param ev   { kind, row, old_status }  — DB 트리거가 보낸 것
 * @param ctx  { kids, mission?, quest?, contributors? } — 알림 함수가 DB 에서 더 읽어온 것
 */
export function plan(ev, ctx) {
  const { kind, row: r, old_status: old } = ev;
  const kids = ctx.kids || [];
  const name = (id) => kids.find((k) => k.id === id)?.name || '아이';
  const out = [];
  const push = (to, title, body, tag, urgent = false) => out.push({ to, title, body, tag, urgent });

  if (kind === 'mission') {
    for (const k of kidsOf(r.kid_ids, kids)) {
      if (r.kind === 'surprise') {
        const bits = [`${r.emoji} ${r.title}`, `${fmt(r.reward)}코인`];
        if (r.first_come) bits.push('선착순 1명!');
        if (r.expires_at) bits.push(`${kstTime(r.expires_at)}까지`);
        push(k.id, '🚨 돌발 미션 발생!', bits.join(' · '), `surprise-${r.id}`, true);
      } else {
        push(k.id, '📋 새 심부름이 생겼어요', `${r.emoji} ${r.title} · +${fmt(r.reward)}코인`, `mission-${r.id}`);
      }
    }
    return out;
  }

  if (kind === 'submission') {
    const m = ctx.mission || {};
    const title = `${m.emoji || ''} ${m.title || '심부름'}`.trim();
    const quick = m.kind === 'quick';
    if (r.status === 'pending' && !quick) {
      const photo = r.photo_path ? ' · 📷 사진 있음' : '';
      push('parents', `✅ ${name(r.kid_id)}: 다 했어요!`, `${title} · 확인해주세요 (+${fmt(r.reward)}코인)${photo}`, `sub-${r.id}`);
    } else if (r.status === 'approved' && old == null) {
      if (quick) push(r.kid_id, `🪙 +${fmt(r.reward)}코인!`, `${title} — 고마워요!`, `sub-${r.id}`);
      else push('parents', `✅ ${name(r.kid_id)}: 완료 (자동 적립)`, `${title} · +${fmt(r.reward)}코인`, `sub-${r.id}`);
    } else if (r.status === 'approved') {
      push(r.kid_id, `🪙 +${fmt(r.reward)}코인!`, `${title} — 승인됐어요`, `sub-${r.id}`);
    } else if (r.status === 'rejected') {
      push(r.kid_id, '🔁 다시 해볼까요?', `${title} — 부모님이 다시 해달래요`, `sub-${r.id}`);
    }
    return out;
  }

  if (kind === 'request' && r.kind === 'shop') {
    // 기프티콘 쿠폰: 구매(보유) → 사용하기(using) → 사줬어요(done) / 다음에(owned) / 환불
    const note = r.parent_note ? ` · “${r.parent_note}”` : '';
    const item = `${r.emoji || '🎁'} ${r.title}`;
    if (r.status === 'owned' && old == null) push('parents', `🎁 ${name(r.kid_id)}: 기프티콘 구매`, `${item} · ${fmt(r.coins)}코인 (쿠폰함에 보관)`, `req-${r.id}`);
    else if (r.status === 'using' || r.status === 'pending') push('parents', `🎟️ ${name(r.kid_id)}: 쿠폰 쓸래요!`, `${item}${r.memo ? ` · “${r.memo}”` : ''}`, `req-${r.id}`);
    else if (r.status === 'done') push(r.kid_id, '🎉 쿠폰 사용 완료!', `${item}${note}`, `req-${r.id}`);
    else if (r.status === 'owned' && old === 'using' && r.decided_at) push(r.kid_id, '⏳ 다음에 써요', `${item} — 쿠폰은 그대로 있어요${note}`, `req-${r.id}`);
    else if (r.status === 'rejected') push(r.kid_id, '😢 쿠폰이 환불됐어요', `${item} · ${fmt(r.coins)}코인 돌려받음${note}`, `req-${r.id}`);
    return out;
  }

  if (kind === 'request') {
    const note = r.parent_note ? ` · “${r.parent_note}”` : '';
    if (r.status === 'pending') {
      const memo = r.memo ? ` · “${r.memo}”` : '';
      const who = name(r.kid_id);
      if (r.kind === 'shop') push('parents', `🎁 ${who}: 기프티콘 구매`, `${r.emoji || ''} ${r.title} · ${fmt(r.coins)}코인${memo}`.trim(), `req-${r.id}`);
      else if (r.kind === 'cash') push('parents', `💵 ${who}: 용돈 요청`, `${fmt(r.won)}원 (${fmt(r.coins)}코인)${memo}`, `req-${r.id}`);
      else push('parents', `🙏 ${who}: 대신 사주세요`, `${r.title} · ${fmt(r.coins)}코인 지불${memo}`, `req-${r.id}`);
    } else if (r.status === 'done') {
      if (r.kind === 'shop') push(r.kid_id, '🎁 기프티콘 도착!', `${r.title}${note}`, `req-${r.id}`);
      else if (r.kind === 'cash') push(r.kid_id, '💵 용돈 받았어요', `${fmt(r.won)}원${note}`, `req-${r.id}`);
      else push(r.kid_id, '🙏 부모님이 사주셨어요', `${r.title}${note}`, `req-${r.id}`);
    } else if (r.status === 'rejected') {
      push(r.kid_id, '😢 요청이 거절됐어요', `${r.title} · ${fmt(r.coins)}코인 돌려받음${note}`, `req-${r.id}`);
    }
    return out;
  }

  if (kind === 'claim') {
    const q = ctx.quest || {};
    push('parents', `🏆 ${name(r.kid_id)}: 퀘스트 클리어!`, `${q.emoji || ''} ${q.title || '퀘스트'} · +${fmt(r.reward)}코인`.trim(), `claim-${r.id}`);
    return out;
  }

  if (kind === 'ledger') {
    if (r.amount <= 0) return out;
    if (r.ref_type === 'transfer') push(r.kid_id, `💌 +${fmt(r.amount)}코인이 왔어요`, r.reason, `ledger-${r.id}`);
    else if (r.ref_type === 'adjust') push(r.kid_id, `🎁 보너스 +${fmt(r.amount)}코인!`, r.reason, `ledger-${r.id}`);
    return out;
  }

  if (kind === 'goal') {
    if (r.status === 'full') push('parents', '🫙 같이 모으기 완료!', `${r.emoji} ${r.title} — ${fmt(r.target)}코인 다 모았어요. 사주세요!`, `goal-${r.id}`);
    else if (r.status === 'done') for (const id of ctx.contributors || []) push(id, `🎉 ${r.title} 사주셨어요!`, `${r.emoji} 같이 모은 보람이 있어요`, `goal-${r.id}`);
    return out;
  }
  return out;
}

/** 이미 상태가 바뀐 '대기' 알림은 보내지 않음 (예: 부모가 대신 완료 처리 → 대기 거치자마자 승인) */
export const stillCurrent = (ev, current) => !current || !('status' in ev.row) || current.status === ev.row.status;
