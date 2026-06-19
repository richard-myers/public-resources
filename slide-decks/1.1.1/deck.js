/* === deck.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck.js — slide-deck library v1 runtime
   ─────────────────────────────────────────────────────────────────────
   Exposes a single global `window.Deck` with:
     Deck.register(tagName, expanderFn)
     Deck.expand(rootEl?)
     Deck.ready(fn)
     Deck.__meta (populated on init)
   Element files in elements/ each call Deck.register('deck-foo', fn) on load.
   No build step, no modules — order is: deck.js first, then element files
   in any order, then DOMContentLoaded triggers init.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  if (window.Deck) return;   // idempotent

  /* ───────── Registry ───────── */
  const expanders = new Map();
  const initCallbacks = [];

  function register(tagName, fn) {
    expanders.set(tagName.toLowerCase(), fn);
  }

  function expand(root) {
    root = root || document;
    // Expand in registration order so containers expand before their
    // children look for already-known siblings. In practice the order
    // doesn't matter for the v1 elements — they all operate locally.
    for (const [tag, fn] of expanders) {
      const nodes = root.querySelectorAll(tag);
      nodes.forEach(el => {
        if (el.dataset.expanded === '1') return;
        try { fn(el); } catch (e) { console.warn('[deck]', tag, 'expander failed', e, el); }
        el.dataset.expanded = '1';
        if (!el.dataset.from) el.dataset.from = tag;
      });
    }
  }

  function ready(fn) { initCallbacks.push(fn); }

  /* ───────── Helpers ───────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    children.flat().forEach(c => {
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  /* ───────── Slide auto-numbering ───────── */
  function numberSlides() {
    let n = 0, a = 0;
    $$('.slide').forEach(slide => {
      if (slide.dataset.status === 'hidden' && !document.body.classList.contains('show-hidden')) return;
      let label;
      if (slide.hasAttribute('data-appendix') || slide.classList.contains('appendix-slide')) {
        a += 1;
        label = 'A' + a;
      } else {
        n += 1;
        label = String(n).padStart(2, '0');
      }
      slide.dataset.slideIndex = label;
      // Replace any existing slide-number / .sn span, or add one.
      let sn = slide.querySelector(':scope > .slide-number, :scope > .sn');
      if (!sn) {
        sn = el('span', { class: 'slide-number' });
        slide.appendChild(sn);
      }
      sn.textContent = label;
    });
  }

  /* ───────── Nav generation ───────── */
  function buildNav(cfg) {
    if ($('.deck-nav')) return;     // user has hand-authored a nav; respect it
    const nav = el('nav', { class: 'deck-nav' });
    const brand = el('div', { class: 'deck-nav-brand' }, cfg.brand || document.title || 'Slides');
    const center = el('div', { class: 'deck-nav-center' });
    $$('.slide').forEach(slide => {
      const id = slide.id;
      if (!id) return;
      if (slide.dataset.status === 'hidden') return;
      const label = slide.dataset.navLabel
        || slide.querySelector('h2')?.textContent?.trim()
        || slide.querySelector('h1')?.textContent?.trim()
        || id;
      const link = el('a', { class: 'deck-nav-link', href: '#' + id }, label);
      if (slide.dataset.act) link.classList.add('act-' + slide.dataset.act);
      center.appendChild(link);
    });
    nav.appendChild(brand);
    nav.appendChild(center);
    document.body.insertBefore(nav, document.body.firstChild);
  }

  /* ───────── Intersection observer ───────── */
  function setupObserver() {
    const slides = $$('.slide');
    const links = $$('.deck-nav-link');
    const setActive = id => links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          if (e.target.id) setActive(e.target.id);
          e.target.classList.add('visible');
          // Trigger bar-row fills
          $$('.deck-bar-row .deck-bar-fill, .bar-row .fill', e.target).forEach(fill => {
            const pct = fill.dataset.value;
            if (pct != null) fill.style.width = pct + '%';
          });
        }
      });
    }, { threshold: 0.4 });
    slides.forEach(s => obs.observe(s));
  }

  /* ───────── Keyboard nav ───────── */
  function setupKeys() {
    const slides = $$('.slide').filter(s =>
      !(s.dataset.status === 'hidden' && !document.body.classList.contains('show-hidden')) &&
      !(s.dataset.status === 'draft' && !document.body.classList.contains('show-drafts'))
    );
    let ci = 0;
    let jumpBuf = '';
    let jumpTimer = null;
    function go(i) {
      ci = Math.max(0, Math.min(slides.length - 1, i));
      slides[ci]?.scrollIntoView({ behavior: 'smooth' });
    }
    // Track current via observer too
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const ix = slides.indexOf(e.target);
          if (ix !== -1) ci = ix;
        }
      });
    }, { threshold: 0.5 });
    slides.forEach(s => obs.observe(s));

    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === ' ') {
        e.preventDefault(); go(ci + 1);
      } else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault(); go(ci - 1);
      } else if (k === 'Home') {
        e.preventDefault(); go(0);
      } else if (k === 'End') {
        e.preventDefault(); go(slides.length - 1);
      } else if (k >= '0' && k <= '9') {
        jumpBuf += k;
        clearTimeout(jumpTimer);
        jumpTimer = setTimeout(() => { jumpBuf = ''; }, 1200);
      } else if (k === 'Enter' && jumpBuf) {
        e.preventDefault();
        const n = parseInt(jumpBuf, 10);
        jumpBuf = '';
        // Find slide by displayed number
        const target = slides.find(s => parseInt(s.dataset.slideIndex, 10) === n);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      } else if (k === '?' || k === '/') {
        e.preventDefault(); toggleSettings();
      } else if (k === 'Escape') {
        closeSettings();
      }
    });
  }

  /* ───────── Hover-index + overlay ───────── */
  function setupHover() {
    // innerHTML usage below is intentional: the source for every overlay
    // is `.hd` / `[slot="detail"]` content authored inside the deck file
    // itself — fully trusted, in the same trust domain as the deck source.
    // No user input ever flows through these paths; sanitising would
    // strip authored <strong>/<br>/<em> formatting the decks rely on.
    // Per-slide DOM-order indexing of every element marked hoverable.
    // Detect either [data-hover] (legacy) or having a [slot="detail"]
    // or `.hd` child (new contract).
    const overlay = el('div', { id: 'deck-overlay' });
    const inner = el('div', { class: 'deck-overlay-inner' });
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    const meta = {};

    $$('.slide').forEach(slide => {
      const slideId = slide.id || slide.dataset.slideIndex;
      const hostList = [];
      // Treat each container with a detail slot OR explicit data-hover as a host.
      const candidates = $$('[data-hover], .deck-hoverable', slide);
      // Also auto-promote elements that contain a child `.hd` or `[slot="detail"]`
      $$('.hd, [slot="detail"]', slide).forEach(child => {
        // Climb to a sensible host: nearest .deck-card, .oc, .dg, .deck-stat, .stat-box, etc.
        const host = child.parentElement;
        if (host && !candidates.includes(host)) {
          host.classList.add('deck-hoverable');
          candidates.push(host);
        }
      });

      let i = 0;
      candidates.forEach(host => {
        const detail = host.querySelector(':scope > .hd, :scope > [slot="detail"]');
        if (!detail) return;
        i += 1;
        const idx = i;
        host.dataset.hoverIndex = idx;

        // Inject superscript number (replace any existing)
        let sup = host.querySelector(':scope > .deck-hover-idx');
        if (!sup) {
          sup = el('sup', { class: 'deck-hover-idx' }, String(idx));
          host.appendChild(sup);
        } else {
          sup.textContent = String(idx);
        }

        // Stash a template for portrait-annotated print + overlay lookup
        const tpl = el('template');
        tpl.setAttribute('data-hover-detail', String(idx));
        tpl.innerHTML = detail.innerHTML;
        slide.appendChild(tpl);

        hostList.push({ idx, text: detail.textContent.trim(), html: detail.innerHTML });

        host.addEventListener('mouseenter', () => {
          if (document.body.classList.contains('no-hover')) return;
          inner.innerHTML =
            '<span class="deck-overlay-idx">' + idx + '</span>' + detail.innerHTML;
          overlay.classList.add('visible');
        });
        host.addEventListener('mouseleave', () => overlay.classList.remove('visible'));
      });

      // Build the print-notes block (used only by portrait-annotated mode)
      if (hostList.length) {
        const notes = el('div', { class: 'deck-print-notes' });
        notes.appendChild(el('h5', null, 'Talking points'));
        const ol = el('ol');
        hostList.forEach(h => {
          const li = el('li', null);
          li.innerHTML = '<span class="deck-note-idx">[' + h.idx + ']</span> ' + h.html;
          ol.appendChild(li);
        });
        notes.appendChild(ol);
        slide.appendChild(notes);
      }

      meta[slideId] = hostList;
    });

    window.Deck.__meta.hoverByIndex = meta;
  }

  /* ───────── Settings panel ───────── */
  let settingsPanel = null;
  function buildSettings(cfg) {
    const panel = el('div', { id: 'deck-settings' });
    panel.appendChild(el('h4', null, 'Settings'));

    function row(labelText, control) {
      const r = el('div', { class: 'deck-setting' });
      r.appendChild(el('label', null, labelText));
      r.appendChild(control);
      panel.appendChild(r);
      return r;
    }

    function toggle(bodyClass, defaultOn) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!defaultOn;
      if (defaultOn) document.body.classList.add(bodyClass);
      cb.addEventListener('change', () => {
        document.body.classList.toggle(bodyClass, cb.checked);
      });
      return cb;
    }

    row('Show draft slides', toggle('show-drafts', false));
    row('Show hidden slides', toggle('show-hidden', false));
    const hoverCb = el('input', { type: 'checkbox' });
    hoverCb.checked = true;
    hoverCb.addEventListener('change', () => {
      document.body.classList.toggle('no-hover', !hoverCb.checked);
    });
    row('Hover-reveal', hoverCb);
    row('Canvas outline', toggle('canvas-outline', false));

    // Theme
    const themeSel = el('select');
    ['mapofag', 'richard-myers', 'richard-myers-dark'].forEach(t => {
      const opt = el('option', { value: t }, t);
      themeSel.appendChild(opt);
    });
    themeSel.value = document.documentElement.dataset.theme || (cfg.theme || 'mapofag');
    themeSel.addEventListener('change', () => {
      document.documentElement.dataset.theme = themeSel.value;
    });
    row('Theme', themeSel);

    // Base font size — must drive both --font-base (consumed by body)
    // and the root font-size (so every `rem` unit scales too).
    const sizeInp = el('input', { type: 'number', min: '12', max: '24', step: '1' });
    sizeInp.value = '16';
    sizeInp.style.width = '60px';
    const applyFontSize = () => {
      const v = sizeInp.value;
      document.documentElement.style.setProperty('--font-base', v + 'px');
      document.documentElement.style.fontSize = v + 'px';
    };
    sizeInp.addEventListener('input', applyFontSize);
    sizeInp.addEventListener('change', applyFontSize);
    row('Base font (px)', sizeInp);

    if (cfg.appendixToggle) {
      const apCb = el('input', { type: 'checkbox' });
      apCb.checked = true;
      apCb.addEventListener('change', () => {
        document.body.classList.toggle('hide-appendix', !apCb.checked);
      });
      row('Appendix', apCb);
    }

    if (cfg.modes && cfg.modes.length) {
      const modeSel = el('select');
      cfg.modes.forEach(m => modeSel.appendChild(el('option', { value: m }, m)));
      modeSel.value = cfg.modes[0];
      document.body.classList.add('mode-' + cfg.modes[0]);
      modeSel.addEventListener('change', () => {
        cfg.modes.forEach(m => document.body.classList.remove('mode-' + m));
        document.body.classList.add('mode-' + modeSel.value);
      });
      row('Audience mode', modeSel);
    }

    panel.appendChild(el('div', { class: 'deck-hint' },
      'Press ? or / to toggle. Esc to close.'));

    document.body.appendChild(panel);
    settingsPanel = panel;

    document.addEventListener('click', e => {
      if (!settingsPanel || !settingsPanel.classList.contains('open')) return;
      if (!settingsPanel.contains(e.target)) closeSettings();
    });
  }
  function toggleSettings() { settingsPanel?.classList.toggle('open'); }
  function closeSettings() { settingsPanel?.classList.remove('open'); }

  /* ───────── Chart.js lazy bootstrap ───────── */
  // SRI hash pinned to Chart.js 4.4.4 (jsdelivr, MIT).
  const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
  const CHART_SRI = 'sha384-19WoTbjzy2pkVN6dRR74JtkbN2cqdcWMD6PMnGCwl5+9bAj5W7Z36nUk0LZ+B7Up';
  let chartPromise = null;
  function loadChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartPromise) return chartPromise;
    chartPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHART_URL;
      s.integrity = CHART_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.Chart);
      s.onerror = () => {
        console.warn('[deck] Chart.js SRI/integrity check failed or load error — retrying without integrity for dev');
        // Dev fallback: retry without SRI so localhost iteration isn't blocked
        // by a future hash mismatch when upgrading. Inlined-runtime decks in
        // production should ship the right hash.
        const s2 = document.createElement('script');
        s2.src = CHART_URL;
        s2.onload = () => resolve(window.Chart);
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return chartPromise;
  }
  // Brand defaults applied once Chart loads
  function applyChartDefaults(Chart) {
    if (!Chart || Chart.__deckDefaults) return;
    Chart.__deckDefaults = true;
    const cs = getComputedStyle(document.documentElement);
    Chart.defaults.font.family = cs.getPropertyValue('--font-body').trim().replace(/['"]/g, '') || 'Figtree';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cs.getPropertyValue('--text-secondary').trim() || '#5a5f63';
    Chart.defaults.borderColor = cs.getPropertyValue('--border').trim() || '#e0ddd8';
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  async function bootstrapCharts() {
    const wraps = $$('.deck-chart-wrap[data-chart]');
    if (!wraps.length) return;
    const Chart = await loadChartJs();
    applyChartDefaults(Chart);
    const palette = [
      getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#547937',
      getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim() || '#0077BD',
      getComputedStyle(document.documentElement).getPropertyValue('--brand-3').trim() || '#F37421',
      getComputedStyle(document.documentElement).getPropertyValue('--brand-4').trim() || '#F6A73F',
      getComputedStyle(document.documentElement).getPropertyValue('--brand-5').trim() || '#67BBE9',
      getComputedStyle(document.documentElement).getPropertyValue('--brand-6').trim() || '#c0392b',
    ];
    wraps.forEach(wrap => {
      if (wrap.__chart) return;
      let cfg;
      try { cfg = JSON.parse(wrap.dataset.chart); }
      catch (e) { console.warn('[deck] bad chart JSON', e, wrap); return; }
      const type = cfg.type || 'bar';
      // Auto-apply palette if datasets lack colours
      cfg.data?.datasets?.forEach((ds, i) => {
        if (type === 'doughnut' || type === 'pie') {
          if (!ds.backgroundColor) ds.backgroundColor = palette;
          if (ds.borderColor == null) ds.borderColor = '#ffffff';
          if (ds.borderWidth == null) ds.borderWidth = 2;
        } else {
          if (!ds.backgroundColor) ds.backgroundColor = palette[i % palette.length];
          if (!ds.borderColor) ds.borderColor = palette[i % palette.length];
        }
      });
      const canvas = wrap.querySelector('canvas') || wrap.appendChild(document.createElement('canvas'));
      wrap.__chart = new Chart(canvas.getContext('2d'), {
        type,
        data: cfg.data,
        options: Object.assign({
          responsive: true,
          maintainAspectRatio: false,
        }, cfg.options || {}),
      });
    });
    document.dispatchEvent(new CustomEvent('chart-ready'));
  }

  /* ───────── deck-config consumption ───────── */
  function readConfig() {
    const c = $('deck-config');
    const cfg = {
      theme: c?.getAttribute('theme') || 'mapofag',
      brand: c?.getAttribute('brand'),
      modes: (c?.getAttribute('modes') || '').split(',').map(s => s.trim()).filter(Boolean),
      appendixToggle: c?.hasAttribute('appendix-toggle'),
      nav: c?.getAttribute('nav') || 'default',
      pdfBranding: c?.getAttribute('pdf-branding') || 'default',
      printLayout: c?.getAttribute('print-layout'),
    };
    document.documentElement.dataset.theme = cfg.theme;
    if (cfg.printLayout) document.body.dataset.printLayout = cfg.printLayout;
    if (cfg.nav && cfg.nav !== 'default') document.body.dataset.nav = cfg.nav;
    if (c) c.remove();
    return cfg;
  }

  /* ───────── ?dev URL flag ───────── */
  function applyUrlFlags() {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has('dev')) document.body.classList.add('canvas-outline');
    const layout = sp.get('print');
    if (layout) document.body.dataset.printLayout = layout;
  }

  /* ───────── Init ───────── */
  function init() {
    const cfg = readConfig();
    document.documentElement.classList.add('deck-hydrated');
    expand();                       // run all registered element expanders
    numberSlides();
    buildNav(cfg);
    buildSettings(cfg);
    setupObserver();
    setupKeys();
    setupHover();
    applyUrlFlags();

    window.Deck.__meta = window.Deck.__meta || {};
    window.Deck.__meta.slideIds = $$('.slide').map(s => s.id || s.dataset.slideIndex);
    window.Deck.__meta.layout = document.body.dataset.printLayout || 'screen';
    window.Deck.__meta.config = cfg;

    // Mark all slides as fade-in candidates
    $$('.slide').forEach(s => s.classList.add('fade-in'));

    bootstrapCharts().catch(e => console.warn('[deck] charts failed', e));

    initCallbacks.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
  }

  window.Deck = {
    register,
    expand,
    ready,
    loadChartJs,
    __meta: { hoverByIndex: {} },
    _internal: { el, $, $$, numberSlides, bootstrapCharts },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* === deck-badge.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-badge.js — pill label

   Authoring:
     <deck-badge variant="info">Alfred</deck-badge>

   Attributes (all optional):
     variant = success | info | highlight | warning | muted | danger
               → data-variant (default: brand-primary tint)

   Behaviour:
     • Host element gets class "deck-badge" so the CSS in §9 applies.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const VARIANTS = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-badge');

    const variant = el.getAttribute('variant');
    if (variant && VARIANTS.has(variant)) {
      el.setAttribute('data-variant', variant);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-badge', expand);
  } else {
    console.warn('[deck-badge] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-bar-row.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-bar-row.js — labelled horizontal bar with animated fill

   Authoring:
     <deck-bar-row label="Adoption" value="68" display="68%" tone="success"></deck-bar-row>
     <deck-bar-row label="Coverage" value="42"></deck-bar-row>

   Attributes:
     label   = string shown to the left of the bar             (required)
     value   = number 0-100, the fill percentage               (required)
     display = string shown to the right (defaults to "<value>%")
     tone    = success | info | highlight | warning | muted | danger
               → sets --accent-color, which colours the fill

   Behaviour:
     • Host gets class "deck-bar-row".
     • Emits label / track + fill / value children.
     • Fill is initialised at width: 0; deck.js's IntersectionObserver
       sets width: <value>% from the fill's data-value attribute when
       the slide scrolls into view (existing wiring — no changes needed).
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-bar-row');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    const label = el.getAttribute('label') || '';
    const value = el.getAttribute('value') || '0';
    const display = el.getAttribute('display') || (value + '%');

    // Replace contents with the structured children. Existing body
    // content (if any) is discarded — bar-row is attribute-driven.
    el.innerHTML = '';

    const labelEl = document.createElement('div');
    labelEl.className = 'deck-bar-label';
    labelEl.textContent = label;

    const track = document.createElement('div');
    track.className = 'deck-bar-track';

    const fill = document.createElement('div');
    fill.className = 'deck-bar-fill';
    fill.dataset.value = value;
    track.appendChild(fill);

    const valueEl = document.createElement('div');
    valueEl.className = 'deck-bar-value';
    valueEl.textContent = display;

    el.appendChild(labelEl);
    el.appendChild(track);
    el.appendChild(valueEl);
  }

  if (window.Deck) {
    window.Deck.register('deck-bar-row', expand);
  } else {
    console.warn('[deck-bar-row] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-callout.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-callout.js — left-border tinted block

   Authoring:
     <deck-callout variant="info">
       <strong>Architectural principle:</strong> body text…
     </deck-callout>

   Attributes (all optional):
     variant = info | success | warning | danger | note
               → data-variant (default: brand-primary tint)

   Behaviour:
     • Host element gets class "deck-callout" so the CSS in §8 applies.
     • Detail content (<div slot="detail"> or .hd child) is left in
       place; deck.js setupHover() auto-promotes when present.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const VARIANTS = new Set([
    'info', 'success', 'warning', 'danger', 'note',
  ]);

  function expand(el) {
    el.classList.add('deck-callout');

    const variant = el.getAttribute('variant');
    if (variant && VARIANTS.has(variant)) {
      el.setAttribute('data-variant', variant);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-callout', expand);
  } else {
    console.warn('[deck-callout] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-card.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-card.js — canonical container element

   Authoring:
     <deck-card accent="top" tone="success">
       <deck-card-title>Title text</deck-card-title>
       <p>Body…</p>
       <div slot="detail">Optional hover-reveal text.</div>
     </deck-card>

   Attributes (all optional):
     accent  = top | left | none   → data-accent (border accent edge)
     border  = none | accent       → data-border (overrides accent)
     tone    = success | info | highlight | warning | muted | danger
                                   → sets --accent-color so the accent
                                     edge and the card-title use that hue

   Behaviour:
     • Host element gets class "deck-card" so all CSS in §8 applies.
     • <deck-card-title> children become <div class="deck-card-title">.
     • Detail content (<div slot="detail"> or .hd child) is left in
       place; deck.js setupHover() auto-promotes the card to a
       hoverable host with index sup + overlay wiring.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-card');

    const accent = el.getAttribute('accent');
    if (accent) el.setAttribute('data-accent', accent);

    const border = el.getAttribute('border');
    if (border) el.setAttribute('data-border', border);

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    // Transform <deck-card-title> → <div class="deck-card-title">
    el.querySelectorAll(':scope > deck-card-title').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-card-title';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-card', expand);
  } else {
    console.warn('[deck-card] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-chart.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-chart.js — Chart.js wrapper

   Authoring (JSON config as a child <script type="application/json">):
     <deck-chart type="bar" height="320">
       <script type="application/json">
       {
         "data": {
           "labels": ["Q1","Q2","Q3","Q4"],
           "datasets": [{ "label": "Revenue", "data": [12, 18, 22, 31] }]
         },
         "options": { "scales": { "y": { "beginAtZero": true } } }
       }
       <\/script>
     </deck-chart>

   Attributes:
     type   = bar | line | doughnut | pie | … (any Chart.js type)
              Stored on the merged config as cfg.type (default: "bar")
     height = optional pixel height for the chart canvas wrapper
              (CSS leaves the wrap height free unless set inline)

   Behaviour:
     • Host gets class "deck-chart-wrap" and the merged config
       serialised onto data-chart="<json>".
     • The runtime's bootstrapCharts() picks up every
       .deck-chart-wrap[data-chart] after expand() runs, lazy-loads
       Chart.js (SRI-pinned 4.4.4), applies brand defaults, and
       instantiates the chart into an appended <canvas>.
     • Brand palette is auto-applied to datasets that don't specify
       backgroundColor / borderColor (runtime).
     • Fires 'chart-ready' on document after all charts render.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    el.classList.add('deck-chart-wrap');

    const type = el.getAttribute('type') || 'bar';
    const height = el.getAttribute('height');
    if (height) el.style.height = /^\d+$/.test(height) ? (height + 'px') : height;

    let cfg = {};
    const cfgScript = el.querySelector(':scope > script[type="application/json"]');
    if (cfgScript) {
      try {
        cfg = JSON.parse(cfgScript.textContent);
      } catch (e) {
        console.warn('[deck-chart] bad JSON config', e, el);
        cfg = {};
      }
      cfgScript.remove();
    }
    if (!cfg.type) cfg.type = type;

    el.setAttribute('data-chart', JSON.stringify(cfg));
  }

  if (window.Deck) {
    window.Deck.register('deck-chart', expand);
  } else {
    console.warn('[deck-chart] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-compare.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-compare.js — 2-col good/bad comparison cards

   Authoring:
     <deck-compare>
       <deck-compare-good>
         <strong>Strengths</strong>
         <ul>
           <li>Clean isolation &mdash; no ambiguity</li>
           <li>GDPR boundaries straightforward</li>
         </ul>
       </deck-compare-good>
       <deck-compare-bad>
         <strong>Weaknesses</strong>
         <ul>
           <li>Full duplication burden on farmer</li>
         </ul>
       </deck-compare-bad>
     </deck-compare>

   Behaviour:
     • Host gets class "deck-compare" (CSS grid, 1fr 1fr).
     • Good/bad child elements get their classes; CSS handles the
       top-accent (success / danger) and the small-caps label styling
       on `> strong:first-child`.
     • For the 3-col feature table (`.compare-table`), use a plain
       <table class="compare-table">; not produced by this element.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expandCompare(el) {
    el.classList.add('deck-compare');
  }

  function expandGood(el) {
    el.classList.add('deck-compare-good');
  }

  function expandBad(el) {
    el.classList.add('deck-compare-bad');
  }

  if (window.Deck) {
    window.Deck.register('deck-compare', expandCompare);
    window.Deck.register('deck-compare-good', expandGood);
    window.Deck.register('deck-compare-bad', expandBad);
  } else {
    console.warn('[deck-compare] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-config.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-config.js — global deck configuration

   Authoring:
     <deck-config theme="mapofag"
                  brand="map-of-ag"
                  modes="default,audience"
                  appendix-toggle
                  nav="default"
                  pdf-branding="default"
                  print-layout="landscape"></deck-config>

   Attributes (all optional):
     theme         = mapofag | richard-myers | richard-myers-dark
                     → written to <html data-theme="…">
     brand         = freeform brand identifier (informational; consumed by
                     downstream PDF / branding pipelines)
     modes         = comma-separated list of audience modes
     appendix-toggle = if present, settings panel exposes the appendix
                       show/hide toggle
     nav           = default | narrative
                     → written to <body data-nav="…"> when non-default
     pdf-branding  = default | …
     print-layout  = landscape | portrait-annotated | portrait-2up
                     → written to <body data-print-layout="…">

   Behaviour:
     deck.js's readConfig() consumes <deck-config> at init BEFORE any
     expanders run, writes its attrs onto <html>/<body>, and removes the
     element. This expander is therefore a DEFENSIVE FALLBACK for the
     case where a <deck-config> is inserted into the DOM after init and
     Deck.expand() is called manually on the new subtree. It mirrors the
     same writes and removes the element.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    const theme = el.getAttribute('theme');
    if (theme) document.documentElement.dataset.theme = theme;

    const nav = el.getAttribute('nav');
    if (nav && nav !== 'default') document.body.dataset.nav = nav;

    const printLayout = el.getAttribute('print-layout');
    if (printLayout) document.body.dataset.printLayout = printLayout;

    // deck-config writes-and-vanishes. Remove after consuming so it
    // doesn't linger as an inline-display empty element on the page.
    el.remove();
  }

  if (window.Deck) {
    window.Deck.register('deck-config', expand);
  } else {
    console.warn('[deck-config] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-flow.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-flow.js — horizontal/vertical step flow with auto-inserted arrows

   Authoring:
     <deck-flow>
       <deck-flow-step tone="info">A: Pure Silo
         <deck-flow-sub>Build now</deck-flow-sub>
       </deck-flow-step>
       <deck-flow-step tone="highlight">C: Fan-In
         <deck-flow-sub>Layer on &amp; test appetite</deck-flow-sub>
       </deck-flow-step>
       <deck-flow-step tone="success">B: Farmer-First
         <deck-flow-sub>Build if demand proven</deck-flow-sub>
       </deck-flow-step>
     </deck-flow>

   Attributes:
     deck-flow
       direction = horizontal | vertical  → data-direction (default horizontal)
       arrows    = auto | none            (default auto — injects arrows
                                           between adjacent steps)
     deck-flow-step
       tone = success | info | highlight | warning | muted | danger
            → sets --accent-color so the step pill is tinted

   Behaviour:
     • <deck-flow-sub> children become <div class="deck-flow-sub">.
     • Arrows are <div class="deck-flow-arrow">→</div> inserted between
       adjacent <deck-flow-step> children; CSS rotates them when the
       parent has data-direction="vertical".
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expandFlow(el) {
    el.classList.add('deck-flow');

    const dir = el.getAttribute('direction');
    if (dir) el.setAttribute('data-direction', dir);

    const arrows = el.getAttribute('arrows') || 'auto';
    if (arrows !== 'none') {
      const steps = Array.from(el.children).filter(
        c => c.tagName && c.tagName.toLowerCase() === 'deck-flow-step'
      );
      for (let i = 0; i < steps.length - 1; i++) {
        const arrow = document.createElement('div');
        arrow.className = 'deck-flow-arrow';
        arrow.textContent = '→';
        steps[i].after(arrow);
      }
    }
  }

  function expandStep(el) {
    el.classList.add('deck-flow-step');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    el.querySelectorAll(':scope > deck-flow-sub').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-flow-sub';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-flow', expandFlow);
    window.Deck.register('deck-flow-step', expandStep);
  } else {
    console.warn('[deck-flow] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-gauge.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-gauge.js — conic gauge ring with centre value + label

   Authoring:
     <deck-gauge value="68" label="Coverage" tone="success"></deck-gauge>
     <deck-gauge value="42" display="42%" label="Adoption" tone="info"></deck-gauge>

   Attributes:
     value   = number 0-100, drives the conic-gradient angle    (required)
     display = string shown in the ring centre (defaults to "<value>%")
     label   = string shown below the ring
     tone    = success | info | highlight | warning | muted | danger
               → sets --accent-color (colour of the conic-gradient arc
                 and the centre value text)

   Behaviour:
     • Host gets class "deck-gauge".
     • Emits ring / value / label children. Ring's conic-gradient
       background is set inline (value-dependent), the rest of its
       styling comes from CSS §11.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-gauge');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    const rawValue = parseFloat(el.getAttribute('value') || '0');
    const value = Math.max(0, Math.min(100, isNaN(rawValue) ? 0 : rawValue));
    const display = el.getAttribute('display') || (Math.round(value) + '%');
    const label = el.getAttribute('label') || '';

    el.innerHTML = '';

    const ring = document.createElement('div');
    ring.className = 'deck-gauge-ring';
    ring.style.background =
      'conic-gradient(var(--accent-color, var(--brand-primary)) ' +
      value + '%, var(--bg-alt) 0)';

    const valueEl = document.createElement('div');
    valueEl.className = 'deck-gauge-value';
    valueEl.textContent = display;
    ring.appendChild(valueEl);

    el.appendChild(ring);

    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'deck-gauge-label';
      labelEl.textContent = label;
      el.appendChild(labelEl);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-gauge', expand);
  } else {
    console.warn('[deck-gauge] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-mark.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-mark.js — inline tinted highlight with optional tooltip

   Authoring:
     The bottleneck is <deck-mark tone="danger" tip="Single shared env">
       data residency
     </deck-mark>, not the product.

   Attributes:
     tone = highlight (default) | success | info | warning | danger
            → data-tone (drives background + text colour)
     tip  = string (optional)
            → data-tip (renders as :hover::after tooltip)

   Behaviour:
     • Host gets class "deck-mark". Inline display (matches legacy span).
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set(['highlight', 'success', 'info', 'warning', 'danger']);

  function expand(el) {
    el.classList.add('deck-mark');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone) && tone !== 'highlight') {
      el.setAttribute('data-tone', tone);
    }

    const tip = el.getAttribute('tip');
    if (tip) el.setAttribute('data-tip', tip);
  }

  if (window.Deck) {
    window.Deck.register('deck-mark', expand);
  } else {
    console.warn('[deck-mark] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-panel.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-panel.js — wrapper for an embedded visualisation / diagram

   Authoring:
     <deck-panel>
       <deck-panel-title>What happens today</deck-panel-title>
       <!-- chart, diagram, list, stat grid, whatever -->
     </deck-panel>

   No author attributes. Tone/colour is the responsibility of whatever
   the panel contains; the panel itself is a neutral card with a
   small-caps label slot.

   Behaviour:
     • Host element gets class "deck-panel" so the CSS in §8 applies.
     • <deck-panel-title> children become <div class="deck-panel-title">.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    el.classList.add('deck-panel');

    el.querySelectorAll(':scope > deck-panel-title').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-panel-title';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-panel', expand);
  } else {
    console.warn('[deck-panel] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-prompt.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-prompt.js — centred italic discussion prompt

   Authoring:
     <deck-prompt>
       What evidence would justify the next phase?
     </deck-prompt>

   No attributes. Used at the bottom of discussion / chapter slides to
   pose a question to the audience.

   Behaviour:
     • Host gets class "deck-prompt".
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    el.classList.add('deck-prompt');
  }

  if (window.Deck) {
    window.Deck.register('deck-prompt', expand);
  } else {
    console.warn('[deck-prompt] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-pros-cons.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-pros-cons.js — strengths/weaknesses column pair

   Authoring:
     <deck-pros-cons>
       <deck-pros label="Strengths">
         <ul>
           <li>Clean isolation &mdash; no ambiguity</li>
           <li>GDPR boundaries straightforward</li>
         </ul>
       </deck-pros>
       <deck-cons label="Weaknesses">
         <ul>
           <li>Full duplication burden on farmer</li>
           <li>No whole-farm view anywhere</li>
         </ul>
       </deck-cons>
     </deck-pros-cons>

   Attributes:
     deck-pros / deck-cons
       label = string (optional) → rendered as an <h5> small-caps header

   Behaviour:
     • Host gets class "deck-pros-cons" (CSS grid 1fr 1fr).
     • <deck-pros>  → <div class="pros-col">, descendant <li>s get
                      class "pro" (✓ glyph) unless already classed.
     • <deck-cons>  → <div class="cons-col">, descendant <li>s get
                      class "con" (✗ glyph) unless already classed.
     • An <h5>label</h5> is prepended inside each col when label is set.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function rewriteColumn(el, colClass, liClass) {
    const div = document.createElement('div');
    div.className = colClass;

    const label = el.getAttribute('label');
    if (label) {
      const h5 = document.createElement('h5');
      h5.textContent = label;
      div.appendChild(h5);
    }

    while (el.firstChild) div.appendChild(el.firstChild);

    div.querySelectorAll('li').forEach(li => {
      if (!li.classList.contains('pro') &&
          !li.classList.contains('con') &&
          !li.classList.contains('neutral')) {
        li.classList.add(liClass);
      }
    });

    el.replaceWith(div);
  }

  function expand(el) {
    el.classList.add('deck-pros-cons');

    el.querySelectorAll(':scope > deck-pros').forEach(c =>
      rewriteColumn(c, 'pros-col', 'pro')
    );
    el.querySelectorAll(':scope > deck-cons').forEach(c =>
      rewriteColumn(c, 'cons-col', 'con')
    );
  }

  if (window.Deck) {
    window.Deck.register('deck-pros-cons', expand);
  } else {
    console.warn('[deck-pros-cons] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-pullquote.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-pullquote.js — large centred display quote

   Authoring:
     <deck-pullquote>
       "It's not about the prompt.<br>It's about the <em>feedback</em>."
       <deck-pullquote-attribution>— Field notes, 2025</deck-pullquote-attribution>
     </deck-pullquote>

   No attributes. Display, sizing, and colour are CSS-driven.

   Behaviour:
     • Host gets class "deck-pullquote".
     • <deck-pullquote-attribution> children become
       <span class="deck-pullquote-attribution">…</span>.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    el.classList.add('deck-pullquote');

    el.querySelectorAll(':scope > deck-pullquote-attribution').forEach(t => {
      const s = document.createElement('span');
      s.className = 'deck-pullquote-attribution';
      while (t.firstChild) s.appendChild(t.firstChild);
      t.replaceWith(s);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-pullquote', expand);
  } else {
    console.warn('[deck-pullquote] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-raw.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-raw.js — fixed-canvas wrapper for hand-authored content

   Authoring:
     <deck-raw fit="contain">
       <svg viewBox="0 0 1040 720">…</svg>
     </deck-raw>

     <deck-raw fit="flex">
       <div class="mockup">…</div>
     </deck-raw>

     <deck-raw fit="bleed">
       <img src="…full-bleed-diagram…">
     </deck-raw>

   Attributes:
     fit = contain | flex | bleed   (defaults to "contain")
           → data-fit (CSS keys §13 on this)
             contain: locked 1040×720 box, overflow hidden
             flex:    1040 wide, ≥720 tall, overflow visible
             bleed:   100% width, edge-to-edge

   Behaviour:
     • Host gets class "deck-raw" and data-fit attribute.
     • Children stay intact — the expander does NOT touch them.
     • The ?dev URL flag draws a dashed outline on contain/flex blocks
       via existing CSS in §13.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const FITS = new Set(['contain', 'flex', 'bleed', 'inline']);

  function expand(el) {
    el.classList.add('deck-raw');
    const fit = el.getAttribute('fit') || 'contain';
    el.setAttribute('data-fit', FITS.has(fit) ? fit : 'contain');
  }

  if (window.Deck) {
    window.Deck.register('deck-raw', expand);
  } else {
    console.warn('[deck-raw] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-resolved.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-resolved.js — list of resolved/closed-out items with side accent

   Authoring:
     <deck-resolved-list>
       <deck-resolved-item>
         <deck-resolved-icon>&#x2705;</deck-resolved-icon>
         <div>
           <h4>Per-customer isolation</h4>
           <p>Hub-and-spoke topology landed Q3 2025.</p>
           <div slot="detail">Optional hover detail…</div>
         </div>
       </deck-resolved-item>
       …
     </deck-resolved-list>

   Behaviour:
     • <deck-resolved-list> host gets class "deck-resolved-list"
       (CSS grid, gap 14px).
     • <deck-resolved-item> host gets class "deck-resolved-item"
       (CSS flex; green left-border per current §10 rule).
     • <deck-resolved-icon> children become
       <div class="deck-resolved-icon">.
     • Detail content (<div slot="detail"> or .hd child) is left in
       place; deck.js setupHover() auto-promotes the item.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expandList(el) {
    el.classList.add('deck-resolved-list');
  }

  function expandItem(el) {
    el.classList.add('deck-resolved-item');

    el.querySelectorAll(':scope > deck-resolved-icon').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-resolved-icon';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-resolved-list', expandList);
    window.Deck.register('deck-resolved-item', expandItem);
  } else {
    console.warn('[deck-resolved] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-section-emphasis.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-section-emphasis.js — the `.dp` block

   Authoring:
     <deck-section-emphasis label="Delivery">
       <strong>Does FM8 ship what we need?</strong>
     </deck-section-emphasis>

   Attributes:
     label = string (optional)  →  rendered as a small-caps tab in the
                                   top-left corner of the bordered box

   Behaviour:
     • Host gets class "deck-section-emphasis".
     • If `label` is set, prepends
       <span class="deck-section-emphasis-label">label</span>.
     • Display defaults to inline for custom elements — set to block
       so the bordered box wraps its content correctly.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  function expand(el) {
    el.classList.add('deck-section-emphasis');

    const label = el.getAttribute('label');
    if (label) {
      const span = document.createElement('span');
      span.className = 'deck-section-emphasis-label';
      span.textContent = label;
      el.insertBefore(span, el.firstChild);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-section-emphasis', expand);
  } else {
    console.warn('[deck-section-emphasis] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-slide.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-slide.js — slide host element

   Authoring:
     <deck-slide id="intro" variant="title">
       <h1>Title</h1>
       <p class="sub">Subtitle</p>
     </deck-slide>

     <deck-slide id="risks" variant="chapter" data-nav-label="Risks">…</deck-slide>
     <deck-slide id="notes" appendix>…</deck-slide>
     <deck-slide id="wip"   status="draft">…</deck-slide>

   Attributes (all optional):
     variant  = title | chapter | content | compare | data | discuss
                → data-variant (CSS keys §slide variants on this)
     appendix = boolean flag
                → data-appendix (numberSlides() uses A-prefix)
     status   = draft | hidden
                → data-status (CSS hides drafts unless body.show-drafts)

   Behaviour:
     • Host gets class "slide" so numberSlides / buildNav / observer
       all find it.
     • If the host's direct children are NOT already wrapped in a single
       <div class="slide-content">, they get auto-wrapped. Authors can
       still hand-write the wrapper for fine control.
     • id / data-nav-label / other attrs are left alone — deck.js's
       buildNav reads them off the host directly.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const VARIANTS = new Set([
    'title', 'chapter', 'content', 'compare', 'data', 'discuss',
  ]);

  function expand(el) {
    el.classList.add('slide');

    const variant = el.getAttribute('variant');
    if (variant && VARIANTS.has(variant)) el.setAttribute('data-variant', variant);

    if (el.hasAttribute('appendix')) el.setAttribute('data-appendix', '');

    const status = el.getAttribute('status');
    if (status) el.setAttribute('data-status', status);

    // Auto-wrap children in .slide-content unless the author already
    // provided exactly one .slide-content as the sole content child.
    // (Tolerate slide-number / sn / template / script siblings.)
    const contentChildren = Array.from(el.children).filter(c => {
      if (c.classList && (c.classList.contains('slide-number') || c.classList.contains('sn'))) return false;
      if (c.tagName === 'TEMPLATE' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') return false;
      return true;
    });
    const alreadyWrapped =
      contentChildren.length === 1 &&
      contentChildren[0].classList &&
      contentChildren[0].classList.contains('slide-content');

    if (!alreadyWrapped) {
      const wrapper = document.createElement('div');
      wrapper.className = 'slide-content';
      contentChildren.forEach(c => wrapper.appendChild(c));
      // Insert wrapper before any slide-number that may already exist
      const sn = el.querySelector(':scope > .slide-number, :scope > .sn');
      if (sn) el.insertBefore(wrapper, sn);
      else el.appendChild(wrapper);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-slide', expand);
  } else {
    console.warn('[deck-slide] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-stat-grid.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-stat-grid.js — grid wrapper + nested deck-stat boxes

   Authoring:
     <deck-stat-grid cols="3">
       <deck-stat tone="success">
         <deck-stat-value>42%</deck-stat-value>
         <deck-stat-label>Lower emissions</deck-stat-label>
       </deck-stat>
       …
     </deck-stat-grid>

   The grid is also frequently used to lay out non-stat children
   (e.g. <deck-card>s), matching the legacy `.sg c3` pattern. The
   expander does not require <deck-stat> children — any block child
   is laid out into the column grid.

   Attributes:
     deck-stat-grid
       cols = 2 | 3 | 4 | 5  →  data-cols (defaults to 3 if absent
                                and grid template not otherwise set)
     deck-stat
       tone = success | info | highlight | warning | muted | danger
              → sets --accent-color so the stat value renders in tone

   Behaviour:
     • Host gets class "deck-stat-grid" / "deck-stat".
     • <deck-stat-value> / <deck-stat-label> children rewrite to
       <div class="deck-stat-value"> / <div class="deck-stat-label">.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expandGrid(el) {
    el.classList.add('deck-stat-grid');
    const cols = el.getAttribute('cols');
    if (cols) el.setAttribute('data-cols', cols);
  }

  function expandStat(el) {
    el.classList.add('deck-stat');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    el.querySelectorAll(':scope > deck-stat-value').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-stat-value';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
    el.querySelectorAll(':scope > deck-stat-label').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-stat-label';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-stat-grid', expandGrid);
    window.Deck.register('deck-stat', expandStat);
  } else {
    console.warn('[deck-stat-grid] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-step-row.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-step-row.js — numbered step tab + body card

   Authoring:
     <deck-step-row num="1">
       <h4>Standardised Export</h4>
       <p>Farmer exports GHG data…</p>
       <div slot="detail">Phase 1 details for hover…</div>
     </deck-step-row>

     <deck-step-row num="2" tone="info">
       <h4>Time-Limited Viewer Links</h4>
       <p>…</p>
     </deck-step-row>

   Attributes:
     num  = string  → rendered in the left-side .deck-step-num tab
     tone = success | info | highlight | warning | muted | danger
                    → sets --accent-color so the number tab is tinted

   Behaviour:
     • Host gets class "deck-step-row" (CSS sets display:flex).
     • A <div class="deck-step-num"> is inserted at the start.
     • Remaining children are wrapped in <div class="deck-step-body">.
     • Detail content (<div slot="detail"> or .hd child) ends up inside
       the body so deck.js setupHover() promotes the body wrapper.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-step-row');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      const varName = tone === 'muted' ? '--muted-accent' : '--' + tone;
      el.style.setProperty('--accent-color', 'var(' + varName + ')');
    }

    const num = el.getAttribute('num') || '';

    const body = document.createElement('div');
    body.className = 'deck-step-body';
    while (el.firstChild) body.appendChild(el.firstChild);

    const numEl = document.createElement('div');
    numEl.className = 'deck-step-num';
    numEl.textContent = num;

    el.appendChild(numEl);
    el.appendChild(body);
  }

  if (window.Deck) {
    window.Deck.register('deck-step-row', expand);
  } else {
    console.warn('[deck-step-row] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-tag.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-tag.js — smaller pill, reads as data

   Authoring:
     <deck-tag tone="success">shipped</deck-tag>

   Attributes (all optional):
     tone = success | info | highlight | warning | muted | danger
            → data-tone (default: brand-primary tint)

   Behaviour:
     • Host element gets class "deck-tag" so the CSS in §9 applies.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const TONES = new Set([
    'success', 'info', 'highlight', 'warning', 'muted', 'danger',
  ]);

  function expand(el) {
    el.classList.add('deck-tag');

    const tone = el.getAttribute('tone');
    if (tone && TONES.has(tone)) {
      el.setAttribute('data-tone', tone);
    }
  }

  if (window.Deck) {
    window.Deck.register('deck-tag', expand);
  } else {
    console.warn('[deck-tag] window.Deck not loaded — include deck.js first');
  }
})();

/* === deck-timeline.js === */
/* ──────────────────────────────────────────────────────────────────────
   deck-timeline.js — vertical timeline + nested timeline-item

   Authoring:
     <deck-timeline>
       <deck-timeline-item status="in-progress">
         <deck-timeline-date>Now &middot; In progress</deck-timeline-date>
         <h4>Modernise the Codebase</h4>
         <p>Body…</p>
       </deck-timeline-item>
       <deck-timeline-item status="future">
         <deck-timeline-date>Next</deck-timeline-date>
         <h4>Split the Deployment</h4>
         <p>…</p>
       </deck-timeline-item>
     </deck-timeline>

   Attributes:
     deck-timeline-item
       status = active | in-progress | future | later
              → data-status (drives the bullet style via CSS)

   Behaviour:
     • Host gets class "deck-timeline" (container) / "deck-timeline-item".
     • <deck-timeline-date> children become <div class="deck-timeline-date">.
     • Detail content (<div slot="detail"> or .hd child) is left in place;
       deck.js setupHover() auto-promotes the item to a hoverable host.
   ────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const STATUSES = new Set(['active', 'in-progress', 'future', 'later']);

  function expandTimeline(el) {
    el.classList.add('deck-timeline');
  }

  function expandItem(el) {
    el.classList.add('deck-timeline-item');

    const status = el.getAttribute('status');
    if (status && STATUSES.has(status)) {
      el.setAttribute('data-status', status);
    }

    el.querySelectorAll(':scope > deck-timeline-date').forEach(t => {
      const d = document.createElement('div');
      d.className = 'deck-timeline-date';
      while (t.firstChild) d.appendChild(t.firstChild);
      t.replaceWith(d);
    });
  }

  if (window.Deck) {
    window.Deck.register('deck-timeline', expandTimeline);
    window.Deck.register('deck-timeline-item', expandItem);
  } else {
    console.warn('[deck-timeline] window.Deck not loaded — include deck.js first');
  }
})();
