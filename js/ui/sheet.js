// 아래에서 올라오는 시트 + 확인 대화상자 + 토스트
import { esc } from './components.js';

const root = () => document.getElementById('sheet-root');

export function openSheet({ title, body, cls = '', onMount = null }) {
  const r = root();
  r.innerHTML = `<div class="backdrop" data-act="sheet-close"></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-act="sheet-close" aria-label="닫기">✕</button></header>
      <div class="sheet-body">${body}</div>
    </section>`;
  r.classList.add('open');
  document.body.classList.add('no-scroll');
  const first = r.querySelector('input[type=text],input[type=number],input[type=password],textarea');
  if (first && !first.value && matchMedia('(pointer:fine)').matches) first.focus();
  onMount?.(r.querySelector('.sheet-body'));
}
export function closeSheet() {
  const r = root();
  r.classList.remove('open');
  r.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
export const sheetOpen = () => root().classList.contains('open');

export function confirmDialog({ title, message = '', ok = '확인', cancel = '취소', danger = false, input = null }) {
  return new Promise((resolve) => {
    const d = document.getElementById('dialog-root');
    d.innerHTML = `<div class="backdrop dim"></div>
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${input ? `<input class="dlg-input" type="${input.type || 'text'}" placeholder="${esc(input.placeholder || '')}" inputmode="${input.inputmode || 'text'}" autocomplete="off">` : ''}
        <div class="dialog-actions">
          ${cancel ? `<button class="btn ghost" data-c="0">${esc(cancel)}</button>` : ''}
          <button class="btn ${danger ? 'danger' : 'primary'}" data-c="1">${esc(ok)}</button>
        </div>
      </div>`;
    d.classList.add('open');
    const inp = d.querySelector('.dlg-input');
    inp?.focus();
    const done = (v) => {
      d.classList.remove('open');
      d.innerHTML = '';
      resolve(v);
    };
    const okVal = () => (input ? inp.value : true);
    d.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => done(b.dataset.c === '1' ? okVal() : null)));
    inp?.addEventListener('keydown', (e) => e.key === 'Enter' && done(okVal()));
    d.querySelector('.backdrop').addEventListener('click', () => done(null));
  });
}

let toastTimer = null;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 2600);
}
