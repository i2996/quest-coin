// 앱 상태: data = 서버에서 불러온 것, ui = 화면 상태
const listeners = new Set();
export const state = {
  data: null, // { space, role, kids, missions, submissions, quests, claims, items, requests, ledger, goals }
  ui: { kidTab: 'missions', parentTab: 'check', shopTab: 'gift', walletTab: 'coupons', busy: false },
};
export const onChange = (fn) => listeners.add(fn);
export function set(patch) {
  if (patch) Object.assign(state.ui, patch);
  listeners.forEach((fn) => fn());
}
