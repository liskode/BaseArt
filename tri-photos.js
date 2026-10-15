/* Tri en ligne des photos d'un export : une carte (groupe de photos d'une même toile) à la fois.
   On choisit une action parmi quatre, puis « Valider le choix » enregistre et passe à la suivante. */
(function () {
  'use strict';

  const MEDIA_BASE = (window.BASEART_CONFIG && window.BASEART_CONFIG.mediaBase) || 'media/';
  const SITU_TYPES = [['D', 'Détail'], ['A', 'Atelier'], ['E', 'Exposition'], ['C', 'Chez un collectionneur'], ['M', 'Combinaison'], ['X', 'Autre']];
  const ACT_KEYS = { d: 'duplicate', n: 'new', a: 'situ', x: 'ignore' };
  const DONE_TEXT = {
    duplicate: (d) => 'Doublon de ' + d.work + (d.keep && d.keep !== 'catalogue' ? ' — la photo choisie remplacera celle du catalogue' : ' — la photo du catalogue est gardée'),
    new: (d) => 'Nouvelle œuvre' + (d.title ? ' « ' + d.title + ' »' : ''),
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
    for (const c of kids) if (c != null && c !== '') n.append(c);
    return n;
  };

  let cfg = null;
  let token = '';
  let exportId = '';
  let imageBase = '';
  let groups = [];
  let decisions = new Map(); // carte → { decision, result }
  let workById = new Map();
  let mediaById = new Map();
  let list = [];
  let pos = 0;
  // État de la carte affichée
  let sel = null; // photo sélectionnée (nom) ou 'catalogue'
  let act = null; // action choisie
  let dupWork = null;
  let situ = null;
  let titles = {}; // titre modifié par photo

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

  // ---- Images et titres
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

  /** Titre proposé pour une photo : titre décodé (meilleure photo) ou nom du fichier sans les codes. */
  function suggestedTitle(g, name) {
    if (name === g.photos[0].name && g.meta && g.meta.title) return g.meta.title;
    return name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/\.(jpe?g|png)$/i, '')
      .replace(/^([-_ ]*[A-Z0-9]{3,5}[-_ :]+)+/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

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
      $('progress-text').textContent += ' — rien à afficher dans ce filtre.';
      return;
    }
    $('stage').hidden = false;
    const entry = decisions.get(g.id) || {};
    const d = entry.decision || {};
    const near = (g.nearest || []).filter((n) => n.d < 0.47 && workById.has(n.work));
    dupWork = d.work || g.work || (near[0] && near[0].work) || null;

    // Présélection de la photo : décision existante, sinon la meilleure image (photo du catalogue comprise)
    const best = g.photos[0];
    const catQ = dupWork ? workById.get(dupWork)?.image_quality : null;
    if (d.category === 'duplicate' && d.keep) sel = d.keep;
    else if (d.best) sel = d.best;
    else if (dupWork && g.proposal === 'duplicate' && catQ != null && (best.quality == null || catQ >= best.quality)) sel = 'catalogue';
    else sel = best.name;

    // Présélection de l'action : décision existante, sinon proposition de l'analyse
    act = d.category || g.proposal || null;
    titles = {};
    if (d.title && d.best) titles[d.best] = d.title;
    situ = { type: d.situ_type || g.type_hint || 'X', works: new Set(d.situ_works || []), later: !!d.later };
    $('situ-caption').value = d.caption || '';
    $('situ-codes').value = '';

    const m = g.meta || {};
    $('meta').replaceChildren(
      ...[
        ...(m.series || []).map((c) => el('span', { class: 'chip', text: c })),
        m.year ? el('span', { class: 'chip', text: String(m.year) }) : null,
        m.format ? el('span', { class: 'chip', text: m.format }) : null,
        m.technique ? el('span', { class: 'chip', text: m.technique }) : null,
      ].filter(Boolean)
    );
    $('proposal').textContent = g.hint ? 'Indice : ' + g.hint + '.' : '';
    const locked = !!entry.result;
    $('decided').hidden = !d.category;
    $('decided').textContent = d.category
      ? (locked ? 'Importée — ' : 'Choix enregistré : ') + DONE_TEXT[d.category](d) + (locked ? '. Ne peut plus être modifié.' : '. Vous pouvez le changer.')
      : '';
    renderAll();
  }

  function renderAll() {
    const g = list[pos];
    renderChoices(g);
    renderTitle(g);
    renderActions(g);
    renderDupPanel(g);
    renderSitu(g);
    renderValidate(g);
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
        label: 'Photo actuelle du catalogue — ' + dupWork + (w.title ? ' « ' + w.title + ' »' : ''), size: '', catalogue: true,
      });
    }
    const current = items.find((i) => i.key === sel) || items.find((i) => !i.catalogue) || items[0];
    sel = current.key;
    if ($('big').getAttribute('src') !== current.big) $('big').src = current.big;
    $('big').alt = current.label;
    $('big-caption').replaceChildren(...[current.label + (current.size ? ' — ' + current.size : ''), dot(current.q)].filter(Boolean));
    $('choices').replaceChildren(...items.map((i) =>
      el('button', {
        type: 'button', class: 'choice' + (i.key === sel ? ' selected' : '') + (i.catalogue ? ' catalogue' : ''),
        title: i.label, onclick: () => { sel = i.key; renderAll(); },
      },
      el('img', { src: i.thumb, alt: '', loading: 'lazy' }),
      el('span', {}, i.catalogue ? 'Catalogue ' + dupWork : i.key === g.photos[0].name ? 'meilleure' : '', dot(i.q)),
      el('span', { class: 'fname', text: i.catalogue ? (workById.get(dupWork)?.title || '') : i.key }))
    ));
  }

  function renderTitle(g) {
    const input = $('title-input');
    const locked = !!(decisions.get(g.id) || {}).result;
    if (sel === 'catalogue') {
      input.value = workById.get(dupWork)?.title || '';
      input.disabled = true;
      $('title-field').firstChild.textContent = 'Titre au catalogue ';
      return;
    }
    const used = act === 'new';
    $('title-field').firstChild.textContent = used
      ? 'Titre de la nouvelle œuvre (modifiable) '
      : 'Titre (utilisé seulement pour une nouvelle œuvre) ';
    input.disabled = locked || !used;
    input.value = titles[sel] !== undefined ? titles[sel] : suggestedTitle(g, sel);
  }
  $('title-input').addEventListener('input', (e) => { if (sel !== 'catalogue') titles[sel] = e.target.value; });

  function renderActions(g) {
    const locked = !!(decisions.get(g.id) || {}).result;
    for (const b of document.querySelectorAll('.big-act')) {
      const a = b.dataset.act;
      b.setAttribute('aria-checked', String(act === a));
      // La photo du catalogue ne peut servir qu'au choix « Doublon »
      b.disabled = locked || (a === 'duplicate' && !dupWork) || (sel === 'catalogue' && a !== 'duplicate');
      const strong = b.querySelector('strong');
      strong.querySelector('.proposed')?.remove();
      if (a === g.proposal) strong.append(el('span', { class: 'proposed', text: 'proposé' }));
    }
    $('desc-duplicate').textContent = dupWork
      ? 'Déjà au catalogue (' + dupWork + ') : ' + (sel === 'catalogue' ? 'on garde la photo du catalogue.' : 'la photo sélectionnée remplacera celle du catalogue.')
      : 'Aucune œuvre proche trouvée au catalogue.';
  }

  function selectAct(a) {
    const b = document.querySelector('.big-act[data-act="' + a + '"]');
    if (!b || b.disabled) return;
    act = a;
    renderAll();
  }
  for (const b of document.querySelectorAll('.big-act')) b.addEventListener('click', () => selectAct(b.dataset.act));

  function renderDupPanel(g) {
    $('dup-panel').hidden = act !== 'duplicate';
    const near = (g.nearest || []).filter((n) => n.d < 0.47 && workById.has(n.work));
    const candidates = [...new Set([dupWork, g.work, ...near.map((n) => n.work)].filter(Boolean))].slice(0, 4);
    $('dup-box').replaceChildren(...candidates.map((id) => {
      const w = workById.get(id);
      const n = near.find((x) => x.work === id);
      return el('button', {
        type: 'button', class: 'work' + (id === dupWork ? ' dup-on' : ''), title: (w && w.title) || id,
        onclick: () => { dupWork = id; renderAll(); },
      }, el('img', { src: catalogueImg(id, false), alt: '' }), el('span', {}, id, n ? ' · ' + n.d.toFixed(2) : '', dot(w && w.image_quality)));
    }));
  }

  function renderSitu(g) {
    $('situ-panel').hidden = act !== 'situ';
    $('situ-types').replaceChildren(...SITU_TYPES.map(([code, label]) =>
      el('button', { type: 'button', 'aria-pressed': String(situ.type === code), text: label, onclick: () => { situ.type = code; renderSitu(g); } })
    ));
    const ids = [...new Set([...situ.works, ...(g.situ_candidates || []).map((c) => c.work), ...(g.nearest || []).map((n) => n.work)])]
      .filter((id) => workById.has(id));
    $('situ-works').replaceChildren(...ids.map((id) => {
      const w = workById.get(id);
      return el('button', {
        type: 'button', class: 'work' + (situ.works.has(id) ? ' on' : ''), title: (w && w.title) || id,
        onclick: () => { situ.works.has(id) ? situ.works.delete(id) : situ.works.add(id); situ.later = false; renderSitu(g); renderValidate(g); },
      }, el('img', { src: catalogueImg(id, false), alt: '', loading: 'lazy' }), el('span', {}, id));
    }));
    $('situ-later').checked = situ.later;
  }
  $('situ-later').addEventListener('change', (e) => {
    situ.later = e.target.checked;
    if (situ.later) situ.works.clear();
    renderSitu(list[pos]);
    renderValidate(list[pos]);
  });
  $('situ-codes').addEventListener('change', (e) => {
    const codes = e.target.value.split(/[\s,;]+/).filter(Boolean).map((c) => 'MS' + c.replace(/^MS/i, '').padStart(4, '0'));
    const unknown = codes.filter((c) => !workById.has(c));
    codes.filter((c) => workById.has(c)).forEach((c) => situ.works.add(c));
    if (situ.works.size) situ.later = false;
    e.target.value = '';
    renderSitu(list[pos]);
    renderValidate(list[pos]);
    if (unknown.length) $('status').textContent = 'Codes inconnus : ' + unknown.join(' ');
  });

  function renderValidate(g) {
    const locked = !!(decisions.get(g.id) || {}).result;
    let ok = !!act && !locked;
    let hint = '';
    if (act === 'duplicate' && !dupWork) ok = false;
    if (act === 'situ' && !situ.works.size && !situ.later) {
      ok = false;
      hint = 'Choisissez au moins un tableau, ou cochez « rattacher plus tard ».';
    }
    $('validate').disabled = !ok;
    if (hint) $('status').textContent = hint;
    else if ($('status').textContent.startsWith('Choisissez')) $('status').textContent = '';
  }

  // ---- Validation
  async function validate() {
    const g = list[pos];
    if ($('validate').disabled) return;
    let decision;
    const title = sel !== 'catalogue' ? (titles[sel] !== undefined ? titles[sel] : suggestedTitle(g, sel)).trim() : undefined;
    if (act === 'duplicate') decision = { category: 'duplicate', work: dupWork, keep: sel };
    else if (act === 'new') decision = { category: 'new', best: sel, title };
    else if (act === 'situ') decision = {
      category: 'situ', best: sel, situ_type: situ.type, situ_works: situ.later ? [] : [...situ.works],
      caption: $('situ-caption').value.trim(), later: situ.later,
    };
    else decision = { category: 'ignore' };
    $('validate').disabled = true;
    $('status').textContent = 'Enregistrement…';
    try {
      const j = await api('/api/triage/decision', { export: exportId, group: g.id, decision, replace_all: true });
      decisions.set(g.id, { ...(decisions.get(g.id) || {}), decision: j.decision });
      if ($('filter').value.startsWith('todo')) {
        buildList(); // la carte décidée sort de la liste « à traiter »
        pos = Math.min(pos, Math.max(0, list.length - 1));
      } else {
        pos = Math.min(pos + 1, list.length - 1);
      }
      show();
      $('status').textContent = 'Choix enregistré.';
    } catch (e) {
      $('status').textContent = 'Erreur : ' + e.message;
      renderValidate(g);
    }
  }
  $('validate').addEventListener('click', validate);

  $('prev').addEventListener('click', () => { if (pos > 0) { pos--; show(); } });
  $('next').addEventListener('click', () => { if (pos < list.length - 1) { pos++; show(); } });
  $('filter').addEventListener('change', () => { buildList(); pos = 0; show(); });
  document.addEventListener('keydown', (e) => {
    if ($('app').hidden || e.metaKey || e.ctrlKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    if (e.key === 'Enter' && !target.matches('textarea, button')) {
      if (target.matches('#situ-codes')) return; // Entrée valide la saisie des codes
      e.preventDefault();
      validate();
      return;
    }
    if (target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowLeft') $('prev').click();
    else if (e.key === 'ArrowRight') $('next').click();
    else if (ACT_KEYS[k]) selectAct(ACT_KEYS[k]);
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
  $('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); login(); } });

  loadConfig().then(() => {
    const saved = window.EditorCommon.getSessionToken();
    if (saved) { $('pass').value = saved; login(); }
  });
})();
