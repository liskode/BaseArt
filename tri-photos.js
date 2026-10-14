/* Tri en ligne des photos d'un export : une carte (groupe de photos d'une même toile) à la fois. */
(function () {
  'use strict';

  const MEDIA_BASE = (window.BASEART_CONFIG && window.BASEART_CONFIG.mediaBase) || 'media/';
  const SITU_TYPES = [['D', 'Détail'], ['A', 'Atelier'], ['E', 'Exposition'], ['C', 'Chez un collectionneur'], ['M', 'Combinaison'], ['X', 'Autre']];
  const PROPOSAL_TEXT = {
    duplicate: 'L’analyse pense que cette œuvre est déjà au catalogue.',
    new: 'L’analyse pense que c’est une nouvelle œuvre.',
    situ: 'L’analyse pense que c’est une autre photo (atelier, exposition, détail…).',
  };
  const DONE_TEXT = {
    duplicate: (d) => 'Doublon de ' + d.work + (d.keep && d.keep !== 'catalogue' ? ' — la photo choisie remplacera celle du catalogue' : ' — la photo du catalogue est gardée'),
    new: () => 'Nouvelle œuvre (photo de référence choisie)',
    situ: (d) => 'Autre photo (' + (SITU_TYPES.find((t) => t[0] === d.situ_type) || ['', 'autre'])[1].toLowerCase() + ')' +
      (d.situ_works && d.situ_works.length ? ' rattachée à ' + d.situ_works.join(', ') : d.later ? ' — rattachement plus tard' : ''),
    ignore: () => 'Écartée',
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  };

  let cfg = null;
  let token = '';
  let exportId = '';
  let imageBase = '';
  let groups = [];
  let decisions = new Map(); // group → { decision, result }
  let workById = new Map();
  let mediaById = new Map();
  let list = [];
  let pos = 0;
  let sel = null; // nom de la photo sélectionnée, ou 'catalogue'
  let dupWork = null;
  let situ = null;

  // ---- API
  async function loadConfig() {
    const r = await fetch('media/collectors-config.json', { cache: 'no-store' });
    cfg = await r.json();
    cfg.triageApiUrl = cfg.triageApiUrl || String(cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/triage-api';
  }
  async function api(pathAndQuery, body) {
    const r = await fetch(cfg.triageApiUrl + pathAndQuery, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify({ token, ...body }) : undefined,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || 'erreur ' + r.status);
    return j;
  }

  // ---- Images
  const exportImg = (p, size) => imageBase + size + '/' + p.thumb.split('/').pop();
  function catalogueImg(id, full) {
    const media = mediaById.get(id);
    if (!media) return '';
    if (full) return MEDIA_BASE + media.split('/').map(encodeURIComponent).join('/');
    const stem = media.replace(/^catalogue\//, '').replace(/\.[^.]+$/, '');
    return MEDIA_BASE + 'catalogue/_thumbs/' + stem.split('/').map(encodeURIComponent).join('/') + '.webp';
  }
  const qColor = (q) => 'hsl(' + Math.round(Math.max(0, Math.min(120, (q - 30) * 2))) + ', 75%, 45%)';
  const dot = (q) => (q == null ? null : el('span', { class: 'dot', style: 'background:' + qColor(q), title: 'Qualité ' + q + '/100' }));

  // ---- Liste et avancement
  const isDone = (g) => !!(decisions.get(g.id) || {}).decision?.category;
  function buildList() {
    const f = $('filter').value;
    list = groups.filter((g) => {
      const done = isDone(g);
      if (f === 'all') return true;
      if (f === 'done') return done;
      if (done) return false;
      if (f === 'todo') return true;
      return g.proposal === f.replace('todo-', '');
    });
  }
  function updateProgress() {
    const done = groups.filter(isDone).length;
    $('progress-bar').style.width = (100 * done) / Math.max(1, groups.length) + '%';
    $('progress-text').textContent = done + ' / ' + groups.length + ' traitées';
    $('position').textContent = list.length ? pos + 1 + ' / ' + list.length : '0 / 0';
  }

  // ---- Affichage d'une carte
  function show() {
    updateProgress();
    const g = list[pos];
    $('status').textContent = '';
    if (!g) {
      $('stage').hidden = true;
      $('status').textContent = '';
      $('progress-text').textContent += ' — rien à afficher dans ce filtre.';
      return;
    }
    $('stage').hidden = false;
    const entry = decisions.get(g.id) || {};
    const d = entry.decision || {};
    const locked = !!entry.result;

    // Œuvre du catalogue la plus proche (doublon possible)
    const near = (g.nearest || []).filter((n) => n.d < 0.47 && workById.has(n.work));
    dupWork = d.work || g.work || (near[0] && near[0].work) || null;

    // Présélection : décision existante, sinon la meilleure image (photo du catalogue comprise)
    const best = g.photos[0];
    const catQ = dupWork ? workById.get(dupWork)?.image_quality : null;
    if (d.category === 'duplicate' && d.keep) sel = d.keep;
    else if (d.best) sel = d.best;
    else if (dupWork && g.proposal === 'duplicate' && catQ != null && (best.quality == null || catQ >= best.quality)) sel = 'catalogue';
    else sel = best.name;

    $('proposal').textContent = (PROPOSAL_TEXT[g.proposal] || '') + (g.hint ? ' Indice : ' + g.hint + '.' : '');
    const m = g.meta || {};
    $('meta').replaceChildren(
      ...[
        ...(m.series || []).map((c) => el('span', { class: 'chip', text: c })),
        m.year ? el('span', { class: 'chip', text: String(m.year) }) : null,
        m.format ? el('span', { class: 'chip', text: m.format }) : null,
        m.technique ? el('span', { class: 'chip', text: m.technique }) : null,
        m.title ? el('span', { class: 'title', text: m.title }) : null,
      ].filter(Boolean)
    );
    $('decided').hidden = !d.category;
    $('decided').textContent = d.category
      ? (locked ? 'Importée — ' : 'Décision : ') + DONE_TEXT[d.category](d) + (locked ? '' : '. Vous pouvez la changer.')
      : '';
    for (const id of ['act-dup', 'act-new', 'act-situ', 'act-ignore']) $(id).disabled = locked;

    renderDupBox(g, near);
    situ = { type: d.situ_type || g.type_hint || 'X', works: new Set(d.situ_works || []) };
    $('situ-panel').hidden = !(d.category === 'situ' && !locked);
    $('situ-caption').value = d.caption || '';
    $('situ-codes').value = '';
    renderSitu(g);
    renderChoices(g);
  }

  function renderChoices(g) {
    const items = g.photos.map((p) => ({
      key: p.name, thumb: exportImg(p, 'th'), big: exportImg(p, 'md'), q: p.quality,
      label: p.name, size: p.w ? p.w + ' × ' + p.h + ' px' : '',
    }));
    if (dupWork && mediaById.has(dupWork)) {
      const w = workById.get(dupWork);
      items.unshift({
        key: 'catalogue', thumb: catalogueImg(dupWork, false), big: catalogueImg(dupWork, true), q: w.image_quality,
        label: 'Photo actuelle du catalogue — ' + dupWork, size: '', catalogue: true,
      });
    }
    const current = items.find((i) => i.key === sel) || items.find((i) => !i.catalogue) || items[0];
    sel = current.key;
    $('big').src = current.big;
    $('big').alt = current.label;
    $('big-caption').replaceChildren(...[current.label + (current.size ? ' — ' + current.size : ''), dot(current.q)].filter(Boolean));
    $('choices').replaceChildren(...items.map((i) =>
      el('button', {
        type: 'button', class: 'choice' + (i.key === sel ? ' selected' : '') + (i.catalogue ? ' catalogue' : ''),
        title: i.label, onclick: () => { sel = i.key; renderChoices(g); updateButtons(); },
      }, el('img', { src: i.thumb, alt: '', loading: 'lazy' }), el('span', {}, i.catalogue ? 'Catalogue ' + dupWork : i.key === g.photos[0].name ? 'meilleure' : '', dot(i.q)))
    ));
    updateButtons();
  }

  function renderDupBox(g, near) {
    const box = $('dup-box');
    box.replaceChildren();
    const candidates = [...new Set([g.work, ...near.map((n) => n.work)].filter(Boolean))].slice(0, 3);
    for (const id of candidates) {
      const w = workById.get(id);
      const n = near.find((x) => x.work === id);
      box.append(el('button', {
        type: 'button', class: 'work' + (id === dupWork ? ' dup-on' : ''), title: (w && w.title) || id,
        onclick: () => { dupWork = id; if (sel === 'catalogue') sel = 'catalogue'; renderDupBox(g, near); renderChoices(g); },
      }, el('img', { src: catalogueImg(id, false), alt: '' }), el('span', {}, id, n ? ' · ' + n.d.toFixed(2) : '', dot(w && w.image_quality))));
    }
  }

  function updateButtons() {
    const g = list[pos];
    const locked = !!(decisions.get(g.id) || {}).result;
    $('act-dup').disabled = locked || !dupWork;
    $('act-dup').firstChild.textContent = dupWork
      ? (sel === 'catalogue' ? 'Doublon de ' + dupWork + ' — garder la photo du catalogue ' : 'Doublon de ' + dupWork + ' — remplacer sa photo par la sélection ')
      : 'Doublon — aucune œuvre proche trouvée ';
    $('act-new').disabled = locked || sel === 'catalogue';
    $('act-situ').disabled = locked || sel === 'catalogue';
  }

  function renderSitu(g) {
    $('situ-types').replaceChildren(...SITU_TYPES.map(([code, label]) =>
      el('button', { type: 'button', 'aria-pressed': String(situ.type === code), text: label, onclick: () => { situ.type = code; renderSitu(g); } })
    ));
    const ids = [...new Set([...situ.works, ...(g.situ_candidates || []).map((c) => c.work), ...(g.nearest || []).map((n) => n.work)])]
      .filter((id) => workById.has(id));
    $('situ-works').replaceChildren(...ids.map((id) => {
      const w = workById.get(id);
      return el('button', {
        type: 'button', class: 'work' + (situ.works.has(id) ? ' on' : ''), title: (w && w.title) || id,
        onclick: () => { situ.works.has(id) ? situ.works.delete(id) : situ.works.add(id); renderSitu(g); },
      }, el('img', { src: catalogueImg(id, false), alt: '', loading: 'lazy' }), el('span', {}, id));
    }));
    $('situ-ok').textContent = situ.works.size ? 'Valider (' + situ.works.size + ' tableau' + (situ.works.size > 1 ? 'x' : '') + ')' : 'Valider';
    $('situ-ok').disabled = !situ.works.size;
  }

  // ---- Décisions
  async function decide(decision) {
    const g = list[pos];
    $('status').textContent = 'Enregistrement…';
    try {
      const j = await api('/api/triage/decision', { export: exportId, group: g.id, decision, replace_all: true });
      decisions.set(g.id, { ...(decisions.get(g.id) || {}), decision: j.decision });
      $('status').textContent = 'Enregistré.';
      // Carte suivante : dans « à traiter », la carte décidée sort de la liste
      const f = $('filter').value;
      if (f.startsWith('todo')) {
        buildList();
        pos = Math.min(pos, Math.max(0, list.length - 1));
      } else {
        pos = Math.min(pos + 1, list.length - 1);
      }
      show();
    } catch (e) {
      $('status').textContent = 'Erreur : ' + e.message;
    }
  }

  $('act-dup').addEventListener('click', () => decide({ category: 'duplicate', work: dupWork, keep: sel }));
  $('act-new').addEventListener('click', () => decide({ category: 'new', best: sel }));
  $('act-ignore').addEventListener('click', () => decide({ category: 'ignore' }));
  $('act-situ').addEventListener('click', () => {
    $('situ-panel').hidden = !$('situ-panel').hidden;
    if (!$('situ-panel').hidden) $('situ-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  const situDecision = (later) => ({
    category: 'situ', best: sel, situ_type: situ.type, situ_works: later ? [] : [...situ.works],
    caption: $('situ-caption').value.trim(), later,
  });
  $('situ-ok').addEventListener('click', () => decide(situDecision(false)));
  $('situ-later').addEventListener('click', () => decide(situDecision(true)));
  $('situ-codes').addEventListener('change', (e) => {
    const codes = e.target.value.split(/[\s,;]+/).filter(Boolean).map((c) => 'MS' + c.replace(/^MS/i, '').padStart(4, '0'));
    const unknown = codes.filter((c) => !workById.has(c));
    codes.filter((c) => workById.has(c)).forEach((c) => situ.works.add(c));
    e.target.value = '';
    renderSitu(list[pos]);
    if (unknown.length) $('status').textContent = 'Codes inconnus : ' + unknown.join(' ');
  });

  $('prev').addEventListener('click', () => { if (pos > 0) { pos--; show(); } });
  $('next').addEventListener('click', () => { if (pos < list.length - 1) { pos++; show(); } });
  $('filter').addEventListener('change', () => { buildList(); pos = 0; show(); });
  document.addEventListener('keydown', (e) => {
    if ($('app').hidden || e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowLeft') $('prev').click();
    else if (e.key === 'ArrowRight') $('next').click();
    else if (k === 'd' && !$('act-dup').disabled) $('act-dup').click();
    else if (k === 'n' && !$('act-new').disabled) $('act-new').click();
    else if (k === 'a' && !$('act-situ').disabled) $('act-situ').click();
    else if (k === 'x' && !$('act-ignore').disabled) $('act-ignore').click();
    else return;
    e.preventDefault();
  });

  // ---- Démarrage
  async function start() {
    const [{ exports }, worksJson] = await Promise.all([
      api('/api/triage/exports?token=' + encodeURIComponent(token)),
      fetch(MEDIA_BASE + 'works.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ works: [] })),
    ]);
    if (!exports.length) throw new Error('Aucun export à trier pour le moment.');
    exportId = new URLSearchParams(location.search).get('export') || exports[0].id;
    const j = await api('/api/triage?token=' + encodeURIComponent(token) + '&export=' + encodeURIComponent(exportId));
    imageBase = j.export.image_base;
    groups = j.export.triage.groups;
    decisions = new Map(j.decisions.map((d) => [d.group_id, d]));
    workById = new Map(j.works.map((w) => [w.id, w]));
    mediaById = new Map((worksJson.works || []).map((w) => [w.id, w.media]));
    document.title = 'Tri des photos — ' + j.export.label;
    buildList();
    pos = 0;
    show();
  }

  async function login() {
    const pass = $('pass').value.trim();
    $('login-err').hidden = true;
    try {
      if (!(await window.EditorCommon.verifyPassword(pass))) throw new Error('Mot de passe incorrect.');
      window.EditorCommon.setSessionToken(pass);
      token = pass;
      $('login').hidden = true;
      $('app').hidden = false;
      await start();
    } catch (e) {
      $('login').hidden = false;
      $('app').hidden = true;
      $('login-err').textContent = e.message;
      $('login-err').hidden = false;
    }
  }
  $('login-btn').addEventListener('click', login);
  $('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

  loadConfig().then(() => {
    const saved = window.EditorCommon.getSessionToken();
    if (saved) { $('pass').value = saved; login(); }
  });
})();
