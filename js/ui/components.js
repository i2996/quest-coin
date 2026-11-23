// 여러 화면에서 같이 쓰는 작은 조각들
import { state } from '../state.js';
import { fmt } from '../logic/coins.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const kidById = (id) => state.data?.kids.find((k) => k.id === id) || null;
export const missionById = (id) => state.data?.missions.find((m) => m.id === id) || null;
export const sortedKids = () => [...(state.data?.kids || [])].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));

export const coin = (n, cls = '') => `<span class="coin-amt ${cls}"><i class="coin-ic" aria-hidden="true"></i>${fmt(n)}</span>`;

export const avatar = (kid, size = '') =>
  kid ? `<span class="avatar ${size}" style="--kc:${esc(kid.color)}">${esc(kid.emoji)}</span>` : '<span class="avatar">❔</span>';

export const kidNames = (ids) => {
  if (!ids || !ids.length) return '모든 아이';
  return ids.map((id) => kidById(id)?.name).filter(Boolean).join(', ') || '모든 아이';
};

export const empty = (emoji, text, sub = '') =>
  `<div class="empty"><div class="empty-ic">${emoji}</div><p>${text}</p>${sub ? `<small>${sub}</small>` : ''}</div>`;

export const KID_COLORS = ['#7c5cff', '#ff7aa8', '#18b4a0', '#ff9f1c', '#3a86ff', '#e85d75', '#8ac926', '#9b5de5'];
export const KID_EMOJIS = ['🐯', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐶', '🐱', '🐧', '🦖'];
export const MISSION_EMOJIS = ['🧹', '🧺', '🍽️', '🥢', '👟', '♻️', '🗑️', '🪴', '🛏️', '📚', '🐶', '🧸', '🛒', '📦', '🚿', '🧽', '✏️', '🎹'];
export const ITEM_EMOJIS = ['🍬', '🍫', '🍦', '🍩', '🧃', '🍪', '🍗', '🍕', '🍔', '🍜', '🍣', '🌭', '🎮', '📺', '🧸', '🎁', '📖', '🎟️'];
export const QUEST_EMOJIS = ['🏆', '🎯', '👑', '🐉', '🗡️', '🛡️', '💎', '🚀', '⭐', '🔥'];
export const CATEGORIES = [
  { id: 'snack', label: '간식', emoji: '🍬' },
  { id: 'delivery', label: '배달음식', emoji: '🛵' },
  { id: 'toy', label: '장난감', emoji: '🧸' },
  { id: 'etc', label: '기타', emoji: '🎁' },
];

/** 이모지 고르기 (라디오) */
export const emojiPicker = (name, list, selected) =>
  `<div class="emoji-pick">${list
    .map((e, i) => `<label><input type="radio" name="${name}" value="${e}" ${e === selected || (!selected && i === 0) ? 'checked' : ''}><span>${e}</span></label>`)
    .join('')}</div>`;

/** 아이 고르기 (체크박스, 아무것도 안 고르면 모두) */
export const kidPicker = (name, selected = []) => {
  const kids = sortedKids();
  if (!kids.length) return '<p class="hint">아이를 먼저 추가해주세요 (가족 탭)</p>';
  return `<div class="kid-pick">${kids
    .map((k) => `<label><input type="checkbox" name="${name}" data-multi value="${k.id}" ${selected.includes(k.id) ? 'checked' : ''}><span>${esc(k.emoji)} ${esc(k.name)}</span></label>`)
    .join('')}</div><p class="hint">아무도 안 고르면 모든 아이에게 보여요</p>`;
};

export const progressBar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>`;
