// 백엔드 선택: 'remote'(Supabase, 가족 공유) / 'demo'(이 기기에만 저장)
let impl = null;
export let mode = null;

export async function use(m) {
  mode = m;
  impl = m === 'demo' ? await import('./local.js') : await import('./remote.js');
  await impl.init();
}

/** api.xxx(...) 로 현재 백엔드 함수 호출 */
export const api = new Proxy({}, {
  get: (_, name) => (...args) => {
    if (!impl) throw new Error('백엔드가 준비되지 않았어요');
    if (typeof impl[name] !== 'function') throw new Error(`지원하지 않는 기능: ${String(name)}`);
    return impl[name](...args);
  },
});
