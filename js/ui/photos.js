// 인증 사진: 찍기/고르기 → 줄이기 → 올리기, 부모 화면에서 보기
import { state } from '../state.js';
import { api, mode } from '../data/api.js';
import { run, who, spaceId, formData } from '../core.js';
import { esc, coin, missionById } from './components.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { coinRain } from './fx.js';

/** 폰 사진(수 MB)을 긴 쪽 maxSide 픽셀 JPEG 로 줄임 → Blob */
export async function shrink(file, maxSide = 1280, quality = 0.8) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('사진을 열지 못했어요. 다른 사진으로 해주세요.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('사진을 줄이지 못했어요'))), 'image/jpeg', quality));
}

/* ---------- 보기 주소 (비공개 저장소라 1시간짜리 주소를 받아 둠) ---------- */
const cache = new Map(); // path → { url, exp }
const fresh = (p) => cache.has(p) && cache.get(p).exp > Date.now();

/** 사진 자리 (주소는 hydrate 가 채움) */
export const photoThumb = (path, cls = 'thumb') =>
  path ? `<button class="${cls}" data-act="photo-view" data-path="${esc(path)}" aria-label="인증 사진 크게 보기"><img data-photo="${esc(path)}" alt="인증 사진"${fresh(path) ? ` src="${esc(cache.get(path).url)}"` : ''}></button>` : '';

let pending = null;
/** 화면에 있는 사진 자리에 주소 채우기 */
export async function hydratePhotos(root = document) {
  const imgs = [...root.querySelectorAll('img[data-photo]:not([src])')];
  if (!imgs.length) return;
  const need = [...new Set(imgs.map((i) => i.dataset.photo))].filter((p) => !fresh(p));
  if (need.length) {
    if (!pending) {
      pending = api.photoUrls(need)
        .then((m) => Object.entries(m).forEach(([p, url]) => cache.set(p, { url, exp: Date.now() + 50 * 60000 })))
        .catch((e) => console.warn('photo urls', e))
        .finally(() => (pending = null));
    }
    await pending;
  }
  for (const i of root.querySelectorAll('img[data-photo]:not([src])')) {
    const c = cache.get(i.dataset.photo);
    if (c) i.src = c.url;
    else i.closest('button')?.classList.add('gone');
  }
}

function viewPhoto(path) {
  openSheet({
    title: '인증 사진',
    cls: 'photo-sheet',
    body: `<div class="photo-big"><img data-photo="${esc(path)}" alt="인증 사진"></div>`,
    onMount: (root) => hydratePhotos(root),
  });
}

/* ---------- 아이: 사진 찍고 완료 ---------- */
function photoSheet(key) {
  const [mid, date] = key.split('|');
  const m = missionById(mid);
  if (!m) return;
  openSheet({
    title: '📷 사진으로 인증하기',
    body: `<form data-form="photo-submit" class="form photo-form">
      <input type="hidden" name="k" value="${esc(key)}">
      <div class="ps-head"><span class="m-emoji">${esc(m.emoji)}</span><div><b>${esc(m.title)}</b><small>${m.photo_required ? '사진을 보내야 완료돼요' : '사진을 보내면 부모님이 더 빨리 확인해요'}</small></div>${coin(m.reward)}</div>
      <label class="photo-pick">
        <input type="file" name="photo" accept="image/*" capture="environment" hidden>
        <img class="ps-preview" alt="" hidden>
        <span class="ps-empty">📷<b>눌러서 사진 찍기</b><small>다 한 모습을 찍어주세요</small></span>
      </label>
      <button class="btn primary big" data-ps-send disabled>사진 보내고 완료!</button>
      ${m.photo_required ? '' : '<button type="button" class="btn ghost" data-act="ps-skip">사진 없이 완료하기</button>'}
    </form>`,
    onMount: (root) => {
      const f = root.querySelector('form');
      const input = f.querySelector('[name=photo]');
      const prev = f.querySelector('.ps-preview');
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (prev.src) URL.revokeObjectURL(prev.src);
        prev.src = URL.createObjectURL(file);
        prev.hidden = false;
        f.querySelector('.ps-empty').hidden = true;
        f.querySelector('[data-ps-send]').disabled = false;
      });
    },
  });
}

/** 완료 보내기 (사진 있으면 먼저 올림). 결과 처리까지 */
export async function submitWith(key, file = null) {
  const [mid, date] = key.split('|');
  const m = missionById(mid);
  let path = null;
  const r = await run(async () => {
    if (file) {
      const demo = mode === 'demo';
      const blob = await shrink(file, demo ? 640 : 1280, demo ? 0.6 : 0.8);
      path = await api.uploadPhoto(spaceId(), who(), blob);
    }
    try {
      return await api.submit(mid, who(), date, path);
    } catch (e) {
      if (path) api.removePhoto(path).catch(() => {}); // 완료가 안 됐으면 올린 사진 정리
      throw e;
    }
  });
  if (r && r !== true) {
    closeSheet();
    if (r.status === 'approved') coinRain(m?.reward || 0, '코인 획득!');
    else toast(path ? '사진과 함께 확인 요청을 보냈어요 📷' : '부모님께 확인 요청을 보냈어요 👍', 'ok');
  }
  return r;
}

export const actions = {
  'photo-view': (el) => viewPhoto(el.dataset.path),
  'photo-submit': (el) => photoSheet(el.dataset.k),
  'ps-skip': (el) => submitWith(el.closest('form').querySelector('[name=k]').value),
};

export const forms = {
  'photo-submit': async (f) => {
    const file = f.querySelector('[name=photo]').files?.[0];
    if (!file) return toast('사진을 먼저 찍어주세요', 'err');
    await submitWith(formData(f).k, file);
  },
};

/** 아이가 완료를 취소하면 올린 사진도 지움 */
export function forgetPhotoOf(subId) {
  const s = state.data?.submissions.find((x) => x.id === subId);
  return s?.photo_path || null;
}
