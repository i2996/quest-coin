// 효과: 코인 쏟아지기, 폭죽
const layer = () => {
  let l = document.getElementById('fx');
  if (!l) {
    l = document.createElement('div');
    l.id = 'fx';
    document.body.appendChild(l);
  }
  return l;
};
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function coinRain(amount = 10, label = '') {
  const l = layer();
  if (label) {
    const b = document.createElement('div');
    b.className = 'fx-gain';
    b.innerHTML = `<i class="coin-ic big"></i><b>+${amount}</b><span>${label}</span>`;
    l.appendChild(b);
    setTimeout(() => b.remove(), 2200);
  }
  if (reduce()) return;
  const n = Math.min(24, 8 + Math.floor(amount / 10));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'coin-ic fx-coin';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.2 + Math.random() * 0.8 + 's';
    l.appendChild(c);
    setTimeout(() => c.remove(), 2800);
  }
}

export function confetti() {
  if (reduce()) return;
  const l = layer();
  const colors = ['#7c5cff', '#ff7aa8', '#ffc531', '#18b4a0', '#3a86ff'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('i');
    c.className = 'fx-conf';
    c.style.left = 50 + (Math.random() - 0.5) * 30 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', (Math.random() - 0.5) * 120 + 'vw');
    c.style.setProperty('--rot', Math.random() * 720 + 'deg');
    c.style.animationDelay = Math.random() * 0.2 + 's';
    l.appendChild(c);
    setTimeout(() => c.remove(), 2400);
  }
}
