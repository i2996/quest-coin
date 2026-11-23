// 화면들이 같이 쓰는 동작: 다시 불러오기, 실행+오류 표시, 지금 누가 쓰는지
import { state, set } from './state.js';
import { prefs } from './prefs.js';
import { api } from './data/api.js';
import { toast } from './ui/sheet.js';
import { todayISO } from './logic/dates.js';

let loading = null;
export async function reload() {
  const sp = prefs.getSpace();
  if (!sp) return;
  if (loading) return loading; // 겹치는 요청은 하나로
  loading = (async () => {
    try {
      const data = await api.loadAll(sp.id);
      state.data = data;
      set();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** 버튼 동작 실행: 오류는 토스트로, 끝나면 다시 불러오기 */
export async function run(fn, okMsg = '') {
  if (state.ui.busy) return null;
  state.ui.busy = true;
  document.body.classList.add('busy');
  try {
    const r = await fn();
    await reload();
    if (okMsg) toast(okMsg, 'ok');
    return r ?? true;
  } catch (e) {
    console.warn(e);
    toast(e.message || '문제가 생겼어요', 'err');
    return null;
  } finally {
    state.ui.busy = false;
    document.body.classList.remove('busy');
  }
}

export const today = () => todayISO();
export const spaceId = () => state.data?.space?.id;
export const isParentDevice = () => state.data?.role === 'parent';
/** 지금 화면: 'parent' | 아이 id | null(고르기) */
export function who() {
  const w = prefs.getWho();
  if (w === 'parent') return isParentDevice() ? 'parent' : null;
  return state.data?.kids.some((k) => k.id === w) ? w : null;
}

/** 폼 → 객체 (같은 이름 체크박스는 배열) */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (form.querySelectorAll(`[name="${el.name}"]`).length > 1 || el.dataset.multi != null) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}
