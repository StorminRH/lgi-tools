// Behaviour for the v2 primitives that CSS can't do alone.

// [data-spotlight]: feed the cursor position to the radial wash.
for (const el of document.querySelectorAll('[data-spotlight]')) {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// [data-count]: roll a number up from zero once it scrolls into view.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = new Intl.NumberFormat('en-US');
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const countUp = (el) => {
  const target = Number(el.dataset.count);
  if (reduce) { el.textContent = fmt.format(target); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1400);
    el.textContent = fmt.format(Math.round(target * easeOut(t)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    io.unobserve(entry.target);
    countUp(entry.target);
  }
});
for (const el of document.querySelectorAll('[data-count]')) io.observe(el);
