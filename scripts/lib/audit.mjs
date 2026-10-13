export const SAFE = { left: 48, top: 48, right: 672, bottom: 1232 };
export const MIN_FONT = 16;
export const TOL = 0.5;

// Runs inside the page via page.evaluate, so it must stay self-contained.
export function audit(SAFE, MIN_FONT, TOL) {
  const stage = document.getElementById('stage');
  const issues = [];
  const r2 = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const fmt = (r) => `[${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`;
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const inside = (r, box) => r.left >= box.left - TOL && r.top >= box.top - TOL && r.right <= box.right + TOL && r.bottom <= box.bottom + TOL;

  function effectiveOpacity(el) {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }
  const visible = (el) => getComputedStyle(el).visibility === 'visible' && effectiveOpacity(el) > 0.02;

  // Range rects cover the font's content area, which is taller than the line box when line-height is tight;
  // trimming to the line-height keeps consecutive wrapped lines from registering as collisions.
  function lineRects(node) {
    const el = node.parentElement;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => {
      const h = Math.min(r.height, lh);
      const cy = (r.top + r.bottom) / 2;
      return { left: r.left, right: r.right, top: cy - h / 2, bottom: cy + h / 2 };
    });
  }

  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() && n.parentElement.closest('script,style') === null ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!visible(el)) continue;
    const rects = lineRects(n);
    if (!rects.length) continue;
    texts.push({ el, text: n.textContent.trim(), rects, deco: !!el.closest('[data-deco]') });
  }

  const decoBoxes = [...stage.querySelectorAll('.corner')].filter(visible).map((el) => ({ name: el.className, r: r2(el.getBoundingClientRect()) }));

  for (const t of texts) {
    const fs = parseFloat(getComputedStyle(t.el).fontSize);
    if (fs < MIN_FONT) issues.push(`font-size ${fs}px < ${MIN_FONT}px: "${t.text}"`);
    for (const r of t.rects) {
      if (!inside(r, SAFE)) issues.push(`outside safe area ${fmt(r)}: "${t.text}"`);
      for (const d of decoBoxes) if (overlap(r, d.r)) issues.push(`text overlaps ${d.name} ${fmt(r)}: "${t.text}"`);
    }
    const box = t.el.closest('.card,.tile,.pill,.chip,.btn,.term,.proj,.check');
    if (box) {
      const b = r2(box.getBoundingClientRect());
      for (const r of t.rects) if (!inside(r, b)) issues.push(`text overflows its box ${fmt(r)} not in ${fmt(b)}: "${t.text}"`);
    }
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const hit = a.rects.some((ra) => b.rects.some((rb) => overlap(ra, rb)));
      if (hit) issues.push(`text collision: "${a.text}" × "${b.text}"`);
    }
  }

  const boxes = [...stage.querySelectorAll('.scene .card,.scene .tile,.scene .pill,.scene .chip,.scene .btn,.scene .term,.scene .proj,.scene .check,.scene .photo,.scene .avatar')].filter(visible);
  for (const el of boxes) {
    const r = r2(el.getBoundingClientRect());
    if (r.right - r.left < 4 || r.bottom - r.top < 4) issues.push(`collapsed box .${el.className}`);
    const isImage = el.matches('.photo,.avatar');
    if (isImage ? !el.querySelector('img')?.complete : !el.innerText.trim()) issues.push(`empty box .${el.className} ${fmt(r)}`);
    if (!inside(r, SAFE)) issues.push(`box outside safe area .${el.className} ${fmt(r)}`);
    for (const d of decoBoxes) if (overlap(r, d.r)) issues.push(`box overlaps ${d.name}: .${el.className}`);
  }

  const visibleScenes = [...stage.querySelectorAll('.scene')].filter((s) => effectiveOpacity(s) > 0.02).map((s) => s.id);
  if (visibleScenes.length !== 1) issues.push(`expected exactly one visible scene, got [${visibleScenes.join(', ')}]`);

  return { issues, textCount: texts.length, boxCount: boxes.length, scene: visibleScenes.join(',') };
}
