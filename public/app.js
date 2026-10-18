'use strict';

// ---------------------------------------------------------------------------
// Formato do save: JSON {StringData, IntData, FloatData, BoolData} cifrado com
// XOR por esta frase (o próprio jogo deixa a mensagem para quem chegar aqui).
// ---------------------------------------------------------------------------
const XOR_KEY = new TextEncoder().encode('If you manage to get this string you are allowed to hack the game all you want');
const SECS = ['StringData', 'IntData', 'FloatData', 'BoolData'];

const TABS = [
  { id: 'recursos', label: 'Recursos', view: 'resources' },
  { id: 'missoes', label: 'Missões', view: 'quests' },
  { id: 'upgrades', label: 'Melhorias', view: 'list', classes: ['Upgrade'], kind: 'flag',
    hint: 'Melhorias compradas com moedas/joias. "Tenho" = comprada. Melhorias comuns voltam a "não tenho" quando você ascende.' },
  { id: 'ascensao', label: 'Habilidades de Ascensão', view: 'list', classes: ['AscensionSkill'], kind: 'flag',
    hint: 'Árvore de ascensão (Pontos de Exterminador). Algumas aparecem com valor 2 no save — é o próprio jogo, o editor mantém.' },
  { id: 'fabricaveis', label: 'Itens fabricáveis', view: 'list', classes: ['PermanentCraftableItem', 'TemporaryCraftableItem'], kind: 'flag',
    hint: 'Itens da bigorna/fabricação. "Tenho" = já fabricado.' },
  { id: 'divindades', label: 'Divindades', view: 'list', classes: ['Divinity'], kind: 'divinity',
    hint: 'O save guarda "comprada#ativa". Só um Chefe das Trevas e um tipo Elemental por vez podem ficar ativos — o jogo pode recusar combinações inválidas.' },
  { id: 'equipamentos', label: 'Equipamentos (loja)', view: 'list', classes: ['Power'], kind: 'count', sec: 'IntData',
    hint: 'Quantidade comprada de cada equipamento da loja (Espada, Arco, Escudo…).' },
  { id: 'arsenal', label: 'Arsenal (armas)', view: 'armory' },
  { id: 'materiais', label: 'Materiais', view: 'list', classes: ['Drop'], kind: 'count', sec: 'StringData',
    hint: 'Quantidade de cada material. O jogo pode limitar ao máximo da sua mochila.' },
  { id: 'pedras', label: 'Pedras do Tempo', view: 'list', classes: ['StoneOfTime'], kind: 'count', sec: 'StringData' },
  { id: 'skins', label: 'Skins', view: 'list', classes: ['CharacterSkin'], kind: 'skin',
    hint: 'Skins de personagem. "Tenho" = desbloqueada.' },
  { id: 'conquistas', label: 'Conquistas', view: 'list', classes: ['Achievement'], kind: 'flag' },
  { id: 'outros', label: 'Outros bônus', view: 'list', classes: ['SoulUpgrade', 'UpgradeInMap'], kind: 'flag',
    hint: 'Melhorias de Alma e itens encontrados nos mapas.' },
  { id: 'vila', label: 'NPCs, vila e vassalos', view: 'list', classes: ['NPC', 'UpgradableBuilding', 'Minion'], kind: 'raw',
    hint: 'Valores compostos separados por "#". NPC: "conhecido#nível". Construções e vassalos têm vários campos — edite com cuidado.' },
  { id: 'bestiario', label: 'Bestiário (abates)', view: 'list', classes: ['Enemy'], kind: 'count', sec: 'StringData',
    hint: 'Quantos de cada inimigo você exterminou.' },
  { sep: true },
  { id: 'avancado', label: 'Avançado (todas as chaves)', view: 'raw' },
];

const RESOURCES = [
  ['Coins', 'Moedas'],
  ['Slayer Points', 'Pontos de Exterminador'],
  ['Jewels of Soul', 'Joias da Alma'],
  ['Divinity Points', 'Pontos de Divindade'],
  ['Ultra Slayer Points', 'Pontos de Ultra Exterminador'],
  ['Current UA SP', 'Pontos de Exterminador (Ultra Ascensão atual)'],
  ['Souls Left', 'Almas'],
  ['Silver Random Boxes Left', 'Caixas Prateadas restantes'],
  ['Lifetime Coins', 'Moedas totais (vida)'],
  ['Lifetime Slayer Points', 'Pontos de Exterminador totais'],
];

const QUEST_GROUPS = [
  ['main', 'Buscas principais'],
  ['event', 'Buscas de evento'],
  ['daily', 'Buscas diárias'],
  ['weekly', 'Buscas semanais'],
];
const QUEST_CLASS_GROUP = { Quest: 'main', DailyQuest: 'daily', WeeklyQuest: 'weekly' };

const CLASS_LABEL = {
  Upgrade: 'Melhoria', AscensionSkill: 'Ascensão', PermanentCraftableItem: 'Permanente',
  TemporaryCraftableItem: 'Temporário', Divinity: 'Divindade', Power: 'Equipamento', Drop: 'Material',
  StoneOfTime: 'Pedra', CharacterSkin: 'Skin', Achievement: 'Conquista', SoulUpgrade: 'Melhoria de Alma',
  UpgradeInMap: 'Item de mapa', NPC: 'NPC', UpgradableBuilding: 'Construção', Minion: 'Vassalo',
  Enemy: 'Inimigo', WeaponItem: 'Arma', KeyWeaponItem: 'Arma-chave', NewBenefit: 'Benefício',
  Quest: 'Missão', DailyQuest: 'Diária', WeeklyQuest: 'Semanal',
};

const state = {
  catalog: {},
  events: {},      // id do evento -> nome em português
  icons: {},
  data: null,
  maps: null,      // sec -> Map(key -> entry)
  orig: null,      // sec -> Map(key -> valor original)
  format: 'xor',
  fileName: 'savedata.sav',
  source: null,    // 'game' | 'file'
  sep: ',',        // separador decimal usado pelo jogo ao gravar números
  info: null,
  tab: 'recursos',
  q: '',
  owned: 'all',
  rawLimit: 200,
  questSel: new Set(),
};

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parts = (v) => String(v ?? '').split('#');
const tabById = (id) => TABS.find((t) => t.id === id);
const itemName = (id) => state.catalog[id]?.pt || state.catalog[id]?.n || id;

function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 4500);
}

function banner(html, kind = '') {
  const el = $('#banner');
  el.hidden = !html;
  el.className = `banner ${kind}`;
  el.innerHTML = html || '';
}

function iconHtml(id) {
  const src = state.icons[id];
  if (src) return `<img class="icon" src="${src}" alt="">`;
  return `<div class="icon">${esc((itemName(id)[0] || '?').toUpperCase())}</div>`;
}

// ---------------------------------------------------------------------------
// codificação do save
// ---------------------------------------------------------------------------
function xor(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ XOR_KEY[i % XOR_KEY.length];
  return out;
}

function tryJson(bytes) {
  try {
    const d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (d && Array.isArray(d.StringData) && Array.isArray(d.IntData)) return d;
  } catch { /* não é JSON */ }
  return null;
}

function decodeSave(bytes) {
  let d = tryJson(xor(bytes));
  if (d) return { data: d, format: 'xor' };
  d = tryJson(bytes);
  if (d) return { data: d, format: 'json' };
  try {
    const txt = new TextDecoder().decode(bytes).trim();
    if (/^[A-Za-z0-9+/=\s]+$/.test(txt)) {
      const bin = Uint8Array.from(atob(txt.replace(/\s/g, '')), (c) => c.charCodeAt(0));
      d = tryJson(xor(bin));
      if (d) return { data: d, format: 'b64xor' };
      d = tryJson(bin);
      if (d) return { data: d, format: 'b64json' };
    }
  } catch { /* não é base64 */ }
  throw new Error('Não reconheci o formato desse arquivo como save do Idle Slayer.');
}

// Igual ao JsonUtility do Unity: compacto e floats inteiros com ".0".
function serialize(d) {
  const floatStr = (v) => (Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toFixed(1) : String(v));
  return '{' + Object.keys(d).map((k) => {
    const v = d[k];
    if (!Array.isArray(v)) return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
    const items = v.map((e) => {
      if (Object.keys(e).some((x) => x !== 'Key' && x !== 'Value')) return JSON.stringify(e);
      const val = k === 'FloatData' && typeof e.Value === 'number' ? floatStr(e.Value) : JSON.stringify(e.Value);
      return `{"Key":${JSON.stringify(e.Key)},"Value":${val}}`;
    });
    return `${JSON.stringify(k)}:[${items.join(',')}]`;
  }).join(',') + '}';
}

function encodeSave() {
  let bytes = new TextEncoder().encode(serialize(state.data));
  if (state.format === 'xor' || state.format === 'b64xor') bytes = xor(bytes);
  if (state.format.startsWith('b64')) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    bytes = new TextEncoder().encode(btoa(bin));
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// números: o jogo grava doubles com a cultura do Windows ("1,5E+50")
// ---------------------------------------------------------------------------
function parseNumber(input) {
  let s = String(input).trim().replace(/\s/g, '').replace(/^\+/, '');
  const m = s.match(/^(-?)([\d.,]+)(?:[eE]([+-]?\d+))?$/);
  if (!m) return NaN;
  let mant = m[2];
  const dot = mant.includes('.'), comma = mant.includes(',');
  if (dot && comma) {
    mant = mant.lastIndexOf(',') > mant.lastIndexOf('.')
      ? mant.replace(/\./g, '').replace(',', '.')
      : mant.replace(/,/g, '');
  } else if (comma) {
    mant = (mant.match(/,/g).length > 1) ? mant.replace(/,/g, '') : mant.replace(',', '.');
  } else if (dot && !m[3] && /^\d{1,3}(\.\d{3})+$/.test(mant)) {
    mant = mant.replace(/\./g, ''); // "1.000.000" no formato brasileiro
  }
  return Number(`${m[1]}${mant}${m[3] ? `e${m[3]}` : ''}`);
}

function formatForSave(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  let s;
  if (Math.abs(n) >= 1e15 || (n !== 0 && Math.abs(n) < 1e-4)) {
    const [mant, exp] = n.toExponential().split('e');
    const neg = exp.startsWith('-');
    const digits = exp.replace(/^[+-]/, '');
    s = `${mant}E${neg ? '-' : '+'}${neg ? digits.padStart(2, '0') : digits}`;
  } else {
    s = String(n);
  }
  return s.replace('.', state.sep);
}

function humanNumber(n) {
  if (!Number.isFinite(n)) return 'número inválido';
  if (Math.abs(n) < 1e15) return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const [mant, exp] = n.toExponential(3).split('e');
  return `${Number(mant).toLocaleString('pt-BR')} × 10^${Number(exp)}`;
}

function detectSep(data) {
  let comma = 0, dot = 0;
  for (const e of data.StringData) {
    if (typeof e.Value !== 'string') continue;
    if (/^-?\d+,\d+(E[+-]\d+)?$/.test(e.Value)) comma++;
    else if (/^-?\d+\.\d+(E[+-]\d+)?$/.test(e.Value)) dot++;
  }
  return dot > comma ? '.' : ',';
}

// ---------------------------------------------------------------------------
// leitura/escrita de valores com rastreio de alterações
// ---------------------------------------------------------------------------
function indexData(data) {
  for (const s of SECS) if (!Array.isArray(data[s])) data[s] = [];
  const maps = {}, orig = {};
  for (const s of SECS) {
    maps[s] = new Map(data[s].map((e) => [e.Key, e]));
    orig[s] = new Map(data[s].map((e) => [e.Key, e.Value]));
  }
  return { maps, orig };
}

const get = (sec, key) => state.maps[sec].get(key)?.Value;
const origGet = (sec, key) => state.orig[sec].get(key);

function put(sec, key, value) {
  const e = state.maps[sec].get(key);
  if (e) e.Value = value;
  else {
    const n = { Key: key, Value: value };
    state.data[sec].push(n);
    state.maps[sec].set(key, n);
  }
}

function del(sec, key) {
  const e = state.maps[sec].get(key);
  if (!e) return;
  state.data[sec].splice(state.data[sec].indexOf(e), 1);
  state.maps[sec].delete(key);
}

// Volta a "não ter": se o item não existia no save original, some de novo; senão grava o valor "vazio".
function clear(sec, key, emptyValue) {
  if (origGet(sec, key) === undefined) del(sec, key);
  else put(sec, key, emptyValue);
}

function isChanged(sec, key) {
  return get(sec, key) !== origGet(sec, key);
}

function changes() {
  const out = [];
  for (const s of SECS) {
    for (const [k, e] of state.maps[s]) {
      const o = state.orig[s].get(k);
      if (o !== e.Value) out.push({ sec: s, key: k, old: o, now: e.Value });
    }
    for (const [k, o] of state.orig[s]) if (!state.maps[s].has(k)) out.push({ sec: s, key: k, old: o, now: undefined });
  }
  return out;
}

// ---------------------------------------------------------------------------
// estado de cada item conforme o tipo
// ---------------------------------------------------------------------------
function itemState(tab, id) {
  switch (tab.kind) {
    case 'flag': {
      const v = get('IntData', id);
      return { owned: Number(v) >= 1, value: v, changed: isChanged('IntData', id) };
    }
    case 'count': {
      const v = get(tab.sec, id);
      return { owned: Number(String(v ?? '0').replace(',', '.')) > 0, value: v, changed: isChanged(tab.sec, id) };
    }
    case 'divinity': {
      const v = get('StringData', id);
      const p = parts(v);
      return { owned: p[0] === '1', active: p[1] === '1', value: v, changed: isChanged('StringData', id) };
    }
    case 'skin': {
      const v = get('StringData', id);
      return { owned: parts(v)[0] === '1', value: v, changed: isChanged('StringData', id) };
    }
    default: {
      const v = get('StringData', id);
      return { owned: v !== undefined && parts(v)[0] !== '0', value: v, changed: isChanged('StringData', id) };
    }
  }
}

function setOwned(tab, id, on) {
  if (tab.kind === 'flag') {
    const o = origGet('IntData', id);
    if (on) put('IntData', id, Number(o) >= 1 ? o : 1);
    else clear('IntData', id, 0);
  } else if (tab.kind === 'divinity') {
    setDivinity(id, on, on ? undefined : false);
  } else if (tab.kind === 'skin') {
    const base = get('StringData', id) ?? origGet('StringData', id) ?? '1#0#';
    const p = parts(base);
    p[0] = on ? '1' : '0';
    if (!on && origGet('StringData', id) === undefined) del('StringData', id);
    else put('StringData', id, p.join('#'));
  }
}

function setDivinity(id, bought, active) {
  const p = parts(get('StringData', id) ?? '0#0');
  while (p.length < 2) p.push('0');
  if (bought !== undefined) p[0] = bought ? '1' : '0';
  if (active !== undefined) p[1] = active ? '1' : '0';
  if (p[1] === '1') p[0] = '1';
  if (p[0] === '0') p[1] = '0';
  const v = p.join('#');
  if (v === '0#0') clear('StringData', id, v);
  else put('StringData', id, v);
}

function setCount(tab, id, text) {
  const t = String(text).trim();
  if (t === '') { clear(tab.sec, id, tab.sec === 'IntData' ? 0 : '0'); return true; }
  const n = parseNumber(t);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return false;
  if (tab.sec === 'IntData') {
    if (n > 2147483647) return false;
    put('IntData', id, n);
  } else {
    put('StringData', id, formatForSave(n));
  }
  if (n === 0 && origGet(tab.sec, id) === undefined) del(tab.sec, id);
  return true;
}

function setRaw(sec, key, text) {
  if (sec === 'IntData') {
    const n = parseNumber(text);
    if (!Number.isInteger(n) || n > 2147483647 || n < -2147483648) return false;
    put(sec, key, n);
  } else if (sec === 'FloatData') {
    const n = parseNumber(text);
    if (!Number.isFinite(n)) return false;
    put(sec, key, n);
  } else if (sec === 'BoolData') {
    if (!/^(true|false)$/i.test(text.trim())) return false;
    put(sec, key, /^true$/i.test(text.trim()));
  } else {
    if (text === '' && origGet(sec, key) === undefined) del(sec, key);
    else put(sec, key, text);
  }
  return true;
}

// ---------------------------------------------------------------------------
// renderização
// ---------------------------------------------------------------------------
const tabItemsCache = new Map();
function tabItems(tab) {
  if (!tabItemsCache.has(tab.id)) {
    tabItemsCache.set(tab.id, Object.entries(state.catalog)
      .filter(([, v]) => tab.classes.includes(v.c))
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.pt || a.n).localeCompare(b.pt || b.n, 'pt-BR')));
  }
  return tabItemsCache.get(tab.id);
}

function tabCount(tab) {
  if (tab.view === 'list') {
    const items = tabItems(tab);
    return `${items.filter((i) => itemState(tab, i.id).owned).length}/${items.length}`;
  }
  if (tab.view === 'armory') return String(armory().list.length);
  if (tab.view === 'quests') {
    const qs = activeQuests();
    return `${qs.filter(questDone).length}/${qs.length}`;
  }
  return '';
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) => (t.sep ? '<hr>' : `
    <button data-tab="${t.id}" class="${t.id === state.tab ? 'active' : ''}">
      <span>${esc(t.label)}</span><span class="count">${state.data ? tabCount(t) : ''}</span>
    </button>`)).join('');
}

function renderHeader() {
  const n = state.data ? changes().length : 0;
  const btn = $('#btnChanges');
  btn.hidden = n === 0;
  btn.textContent = `${n} alteraç${n === 1 ? 'ão' : 'ões'}`;
  $('#btnSave').disabled = !state.data || (n === 0 && state.source === 'game');
  $('#btnDownload').disabled = !state.data;
  const info = state.info;
  const where = state.source === 'game'
    ? `<b>${esc(state.fileName)}</b> do jogo · ${esc(info?.saveDir || '')}`
    : `<b>${esc(state.fileName)}</b> (arquivo aberto do computador)`;
  const ver = state.data ? get('StringData', 'Last Played Version') : null;
  $('#fileInfo').innerHTML = state.data ? `${where}${ver ? ` · versão ${esc(ver)}` : ''}` : 'Nenhum save carregado';
}

function refresh() {
  renderTabs();
  renderHeader();
}

function render() {
  refresh();
  const tab = tabById(state.tab);
  const main = $('#main');
  if (!state.data) {
    main.innerHTML = '<p class="empty">Nenhum save carregado. Use "Recarregar" para ler o save do jogo ou "Abrir arquivo…".</p>';
    return;
  }
  if (tab.view === 'resources') main.innerHTML = renderResources();
  else if (tab.view === 'list') main.innerHTML = renderList(tab);
  else if (tab.view === 'armory') main.innerHTML = renderArmory();
  else if (tab.view === 'quests') main.innerHTML = renderQuests();
  else main.innerHTML = renderRawView();
}

function toolbar(tab, extra = '') {
  const seg = (v, l) => `<button data-owned="${v}" class="${state.owned === v ? 'on' : ''}">${l}</button>`;
  return `<div class="toolbar">
    <input type="search" id="q" placeholder="Buscar por nome, efeito ou ID…" value="${esc(state.q)}">
    ${tab ? `<div class="seg">${seg('all', 'Todos')}${seg('yes', 'Tenho')}${seg('no', 'Não tenho')}</div>` : ''}
    ${extra}
  </div>`;
}

function matches(item) {
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return [item.pt, item.n, item.e, item.d, item.id].some((s) => s && s.toLowerCase().includes(q));
}

function filtered(tab) {
  return tabItems(tab).filter((i) => {
    if (!matches(i)) return false;
    if (state.owned === 'all') return true;
    const own = itemState(tab, i.id).owned;
    return state.owned === 'yes' ? own : !own;
  });
}

function renderList(tab) {
  const items = filtered(tab);
  const bulk = tab.kind === 'count'
    ? `<span class="spacer"></span><input type="text" id="bulkValue" placeholder="valor" style="width:110px">
       <button data-bulk="set">Definir ${items.length} filtrados</button>`
    : tab.kind === 'raw' ? '' : `<span class="spacer"></span>
       <button data-bulk="on">Tenho todos (${items.length})</button>
       <button data-bulk="off" class="ghost">Não tenho nenhum</button>`;
  return `<h2>${esc(tab.label)}</h2>
    ${tab.hint ? `<p class="hint">${esc(tab.hint)}</p>` : ''}
    ${toolbar(tab, bulk)}
    <div class="list">${items.length ? items.map((i) => renderRow(tab, i)).join('') : '<p class="empty">Nada encontrado.</p>'}</div>`;
}

function renderRow(tab, item) {
  const st = itemState(tab, item.id);
  const multi = tab.classes.length > 1 ? `<span class="tag">${esc(CLASS_LABEL[item.c] || item.c)}</span>` : '';
  const en = item.pt && item.pt !== item.n ? esc(item.n) : '';
  const effect = item.e || item.d;
  let controls = '';
  if (tab.kind === 'flag' || tab.kind === 'skin') {
    const odd = tab.kind === 'flag' && st.value !== undefined && st.value !== 0 && st.value !== 1 ? `<span class="val">valor ${esc(st.value)}</span>` : '';
    controls = `${odd}${switchHtml('own', st.owned, 'Tenho', 'Não tenho')}`;
  } else if (tab.kind === 'divinity') {
    controls = `${switchHtml('own', st.owned, 'Comprada', 'Não tenho')}${switchHtml('active', st.active, 'Ativa', 'Inativa')}`;
  } else if (tab.kind === 'count') {
    controls = `<input type="text" data-act="count" value="${esc(st.value ?? '')}" placeholder="0" inputmode="numeric">`;
  } else {
    controls = `<input type="text" class="wide" data-act="raw" value="${esc(st.value ?? '')}" placeholder="(não existe no save)">`;
  }
  return `<div class="row ${st.owned ? 'owned' : ''} ${st.changed ? 'changed' : ''}" data-id="${item.id}">
    ${iconHtml(item.id)}
    <div>
      <div class="name">${esc(item.pt || item.n)}</div>
      <div class="sub">${multi}${en}</div>
      ${effect ? `<div class="effect">${esc(effect)}</div>` : ''}
    </div>
    <div class="controls">${controls}</div>
  </div>`;
}

function switchHtml(act, on, yes, no) {
  return `<label class="switch"><input type="checkbox" data-act="${act}" ${on ? 'checked' : ''}><span class="track"></span><span class="lbl">${on ? yes : no}</span></label>`;
}

function rerenderRow(id) {
  const tab = tabById(state.tab);
  const row = $(`.row[data-id="${id}"]`);
  if (!row || tab.view !== 'list') return;
  row.outerHTML = renderRow(tab, { id, ...state.catalog[id] });
  refresh();
}

// --- recursos ---
function renderResources() {
  const cards = RESOURCES.filter(([k]) => get('StringData', k) !== undefined).map(([k, label]) => {
    const v = get('StringData', k);
    const n = parseNumber(v);
    return `<div class="card ${isChanged('StringData', k) ? 'changed' : ''}" data-key="${esc(k)}">
      <label>${esc(label)}<span class="key">${esc(k)}</span></label>
      <input type="text" data-act="res" value="${esc(v)}" spellcheck="false">
      <div class="preview">${Number.isFinite(n) ? `= ${humanNumber(n)}` : ''}</div>
      <div class="quick">
        ${['1000000', '1e15', '1e50', '1e100'].map((q) => `<button class="small ghost" data-quick="${q}">${q}</button>`).join('')}
      </div>
    </div>`;
  }).join('');
  const curated = new Set([...RESOURCES.map(([k]) => k), 'Weapon Inventory', 'Key Items Inventory']);
  const isId = (k) => /^[a-z0-9]{20}$/.test(k);
  const rest = [];
  for (const sec of ['StringData', 'IntData', 'FloatData', 'BoolData']) {
    for (const e of state.data[sec]) if (!curated.has(e.Key) && !isId(e.Key)) rest.push({ sec, key: e.Key });
  }
  const q = state.q.toLowerCase();
  const shown = rest.filter((r) => !q || r.key.toLowerCase().includes(q));
  return `<h2>Recursos</h2>
    <p class="hint">Digite valores como <b>1e100</b>, <b>1,5e50</b> ou <b>1.000.000</b>. O editor converte para o formato do jogo.</p>
    <div class="cards">${cards}</div>
    <h3>Estatísticas e outras chaves com nome</h3>
    <p class="hint">Valores crus do save (contadores, datas em segundos desde 1970, configurações). Mexa só se souber o que é.</p>
    ${toolbar(null)}
    ${rawTable(shown)}`;
}

// --- tabela crua ---
function rawTable(rows) {
  const limited = rows.slice(0, state.rawLimit);
  return `<table class="raw">
    <thead><tr><th style="width:30%">Chave</th><th style="width:25%">Item</th><th>Valor</th><th style="width:40px"></th></tr></thead>
    <tbody>${limited.map(({ sec, key }) => {
      const v = get(sec, key);
      const cat = state.catalog[key];
      return `<tr class="${isChanged(sec, key) ? 'changed' : ''}" data-sec="${sec}" data-key="${esc(key)}">
        <td class="k">${esc(key)}<div class="sec">${sec}</div></td>
        <td>${cat ? `${esc(cat.pt || cat.n)}<div class="sec">${esc(CLASS_LABEL[cat.c] || cat.c)}</div>` : ''}</td>
        <td><input type="text" data-act="rawcell" value="${esc(typeof v === 'string' ? v : JSON.stringify(v))}" spellcheck="false"></td>
        <td><button class="small ghost danger" data-act="delkey" title="Remover chave do save">×</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>
  ${rows.length > limited.length ? `<button class="more" data-act="more">Mostrar mais (${rows.length - limited.length} restantes)</button>` : ''}`;
}

function renderRawView() {
  const q = state.q.toLowerCase();
  const rows = [];
  for (const sec of SECS) {
    for (const e of state.data[sec]) {
      if (q) {
        const cat = state.catalog[e.Key];
        const hay = [e.Key, String(e.Value), cat?.pt, cat?.n].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({ sec, key: e.Key });
    }
  }
  return `<h2>Avançado</h2>
    <p class="hint">Todas as ${SECS.reduce((n, s) => n + state.data[s].length, 0)} chaves do save, inclusive as que o editor não reconhece. Busque por nome do item, chave ou valor.</p>
    ${toolbar(null)}
    <div class="add-weapon">
      <div class="fields">
        <select id="newSec">${SECS.map((s) => `<option>${s}</option>`).join('')}</select>
        <input type="text" id="newKey" placeholder="Chave" style="flex:1">
        <input type="text" id="newVal" placeholder="Valor" style="flex:1">
        <button data-act="addkey">Adicionar chave</button>
      </div>
    </div>
    ${rawTable(rows)}`;
}

// --- missões ---
// No save cada missão é IntData com o progresso; -1 = já concluída e resgatada. O jogo só cria a chave
// quando a missão ganha o primeiro progresso, então as liberadas e ainda zeradas não aparecem no save:
// uma missão principal está liberada quando o pacote de buscas dela (bundleRequired) foi comprado, e as de
// evento durante as datas do evento (calendário da configuração remota do jogo).
// "Completar" põe o progresso na meta: a recompensa é resgatada no jogo, como normalmente.
function gameEvent(evId) {
  const ev = (state.info?.events || []).find((e) => e.id === evId);
  return ev && ev.enabled ? ev : null;
}

function eventActive(evId, now = new Date()) {
  const ev = gameEvent(evId);
  if (!ev) return false;
  const md = (m, d) => m * 100 + d;
  const today = md(now.getMonth() + 1, now.getDate());
  const start = md(ev.start_month, ev.start_day), end = md(ev.end_month, ev.end_day);
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

function questUnlocked(cat) {
  if (cat.qe) return eventActive(cat.qe[0]);
  return cat.qb ? Number(get('IntData', cat.qb)) >= 1 : false;
}

function activeQuests() {
  const out = [];
  for (const [id, cat] of Object.entries(state.catalog)) {
    const group = cat.qe ? 'event' : QUEST_CLASS_GROUP[cat.c];
    if (!group) continue;
    const orig = origGet('IntData', id);
    const cur = get('IntData', id);
    if (orig !== undefined) {
      if (Number(orig) < 0) continue;
    } else if (cur === undefined && !(cat.c === 'Quest' && questUnlocked(cat))) {
      continue;
    }
    out.push({ id, ...cat, group, value: Number(cur ?? 0), goal: cat.q ? cat.q[1] : null });
  }
  return out.sort((a, b) => (a.pt || a.n).localeCompare(b.pt || b.n, 'pt-BR'));
}

const questDone = (q) => q.goal != null && q.value >= q.goal;

function completeQuest(id) {
  const goal = state.catalog[id]?.q?.[1];
  if (goal == null) return false;
  if (Number(get('IntData', id) ?? 0) < goal) put('IntData', id, goal);
  return true;
}

function questGroupLabel(group, label, list) {
  if (group !== 'event') return label;
  const evId = list[0]?.qe?.[0];
  const ev = gameEvent(evId);
  const p = (n) => String(n).padStart(2, '0');
  const when = ev ? ` (${p(ev.start_day)}/${p(ev.start_month)} a ${p(ev.end_day)}/${p(ev.end_month)})` : '';
  return `${label} — ${state.events[evId] || evId}${when}`;
}

function renderQuests() {
  const quests = activeQuests();
  for (const id of state.questSel) if (!quests.some((q) => q.id === id && !questDone(q))) state.questSel.delete(id);
  const pending = quests.filter((q) => !questDone(q) && q.goal != null);
  const sel = state.questSel.size;
  const groups = QUEST_GROUPS.map(([group, label]) => {
    const list = quests.filter((q) => q.group === group);
    if (!list.length) return '';
    return `<h3>${esc(questGroupLabel(group, label, list))} <span class="sub">${list.filter(questDone).length}/${list.length} completas</span></h3>
      <div class="list">${list.map(renderQuestRow).join('')}</div>`;
  }).join('');
  return `<h2>Missões</h2>
    <p class="hint">Missões liberadas e ainda não resgatadas (inclusive as que ainda estão em 0, que o jogo não grava no save).
      <b>Completar</b> coloca o progresso na meta — depois abra o jogo e clique em
      "Reivindicar Recompensa" para ganhar a recompensa normalmente. Diárias e semanais são trocadas pelo jogo quando o período vira,
      então complete as atuais antes disso.</p>
    <div class="toolbar">
      <button data-act="qselall" ${pending.length ? '' : 'disabled'}>${sel && sel === pending.length ? 'Limpar seleção' : `Selecionar incompletas (${pending.length})`}</button>
      <span class="spacer"></span>
      <button class="primary" data-act="qbulk" ${sel ? '' : 'disabled'}>Completar selecionadas (${sel})</button>
    </div>
    ${groups || '<p class="empty">Nenhuma missão em andamento neste save.</p>'}`;
}

function renderQuestRow(q) {
  const done = questDone(q);
  const changed = isChanged('IntData', q.id);
  const pct = q.goal ? Math.min(100, Math.round((q.value / q.goal) * 100)) : 0;
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  return `<div class="row qrow ${done ? 'owned' : ''} ${changed ? 'changed' : ''}" data-id="${q.id}">
    <input type="checkbox" data-act="qsel" ${state.questSel.has(q.id) ? 'checked' : ''} ${done || q.goal == null ? 'disabled' : ''} title="Selecionar">
    ${iconHtml(q.id)}
    <div>
      <div class="name">${esc(q.pt || q.n)}</div>
      ${q.qe ? `<div class="sub"><span class="tag">Parte ${esc(q.qe[1])}</span></div>` : ''}
      ${q.d ? `<div class="effect">${esc(q.d)}</div>` : ''}
      <div class="bar ${done ? 'done' : ''}"><i style="width:${pct}%"></i></div>
      <div class="sub">${fmt(q.value)} / ${q.goal != null ? fmt(q.goal) : '?'}${done ? ' · completa — resgate no jogo' : ''}</div>
    </div>
    <div class="controls">
      <input type="text" data-act="qprog" value="${esc(q.value)}" title="Progresso" style="width:110px">
      ${changed ? '<button class="small ghost" data-act="qundo">Desfazer</button>' : ''}
      <button class="small ${done ? 'ghost' : 'primary'}" data-act="qdone" ${done || q.goal == null ? 'disabled' : ''}>Completar</button>
    </div>
  </div>`;
}

// --- arsenal ---
function armory() {
  const raw = get('StringData', 'Weapon Inventory');
  try {
    const d = raw ? JSON.parse(raw) : { list: [] };
    if (!Array.isArray(d.list)) d.list = [];
    return d;
  } catch {
    return { list: [], broken: true };
  }
}

function saveArmory(d) {
  put('StringData', 'Weapon Inventory', JSON.stringify(d));
}

function benefitText(id, value) {
  const t = state.catalog[id]?.pt || state.catalog[id]?.n || id;
  return t.replace('{0}', value ?? 'X').replace(/\{\d\}/g, '…');
}

function poolChecks(weaponId, chosenB, chosenS, prefix) {
  const cat = state.catalog[weaponId] || {};
  const pool = cat.b || [];
  const skills = cat.s || [];
  const extraB = chosenB.filter((b) => !pool.some(([id]) => id === b));
  const b = pool.map(([id, val]) => `<label><input type="checkbox" data-act="${prefix}b" value="${id}" ${chosenB.includes(id) ? 'checked' : ''}>${esc(benefitText(id, val))}</label>`)
    .concat(extraB.map((id) => `<label><input type="checkbox" data-act="${prefix}b" value="${id}" checked>${esc(benefitText(id))}</label>`));
  const s = skills.map((id) => `<label><input type="checkbox" data-act="${prefix}s" value="${id}" ${chosenS.includes(id) ? 'checked' : ''}>${esc(itemName(id))}${state.catalog[id]?.d ? ` — ${esc(state.catalog[id].d)}` : ''}</label>`);
  return `<div class="checks">
    ${b.length ? `<div class="title">Benefícios</div>${b.join('')}` : ''}
    ${s.length ? `<div class="title">Habilidades</div>${s.join('')}` : ''}
  </div>`;
}

function renderArmory() {
  const d = armory();
  const weapons = Object.entries(state.catalog).filter(([, v]) => v.c === 'WeaponItem')
    .sort((a, b) => (a[1].pt || a[1].n).localeCompare(b[1].pt || b[1].n, 'pt-BR'));
  const sel = state.newWeapon || weapons[0]?.[0];
  const selCat = state.catalog[sel] || {};
  const list = d.list.map((w, idx) => `
    <div class="weapon" data-idx="${idx}">
      <header>${iconHtml(w.itemID)}<div class="name">${esc(itemName(w.itemID))}<div class="sub">uid ${esc(w.uid)}${w.slot !== -1 && w.slot !== undefined ? ` · equipada (slot ${esc(w.slot)})` : ''}</div></div>
        <button class="small ghost danger" data-act="wdel">Remover</button></header>
      <div class="fields">
        <label>Nível <input type="number" min="1" data-act="wlevel" value="${esc(w.currentLevel)}"></label>
        <label><input type="checkbox" data-act="wexc" ${w.isExcellent ? 'checked' : ''}> Excelente</label>
      </div>
      ${poolChecks(w.itemID, w.currentBenefits || [], w.currentSkills || [], 'w')}
    </div>`).join('');
  return `<h2>Arsenal</h2>
    <p class="hint">Armas guardadas no save. O jogo normalmente sorteia alguns benefícios do conjunto possível de cada arma — aqui você escolhe quais ela tem.</p>
    ${d.broken ? '<p class="banner error">Não consegui ler o inventário de armas deste save.</p>' : ''}
    <div class="add-weapon">
      <div class="fields">
        <strong>Adicionar arma</strong>
        <select id="newWeapon">${weapons.map(([id, v]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(v.pt || v.n)}</option>`).join('')}</select>
        <label>Nível <input type="number" id="newWeaponLevel" min="1" value="1" style="width:80px"></label>
        <label><input type="checkbox" id="newWeaponExc"> Excelente</label>
        <button class="primary" data-act="wadd">Adicionar</button>
      </div>
      ${poolChecks(sel, (selCat.b || []).map(([id]) => id), selCat.s || [], 'n')}
    </div>
    <div class="weapons">${list || '<p class="empty">Nenhuma arma no inventário.</p>'}</div>`;
}

function addWeapon() {
  const d = armory();
  const itemID = $('#newWeapon').value;
  const level = Math.max(1, parseInt($('#newWeaponLevel').value, 10) || 1);
  const benefits = [...document.querySelectorAll('.add-weapon input[data-act="nb"]:checked')].map((i) => i.value);
  const skills = [...document.querySelectorAll('.add-weapon input[data-act="ns"]:checked')].map((i) => i.value);
  const maxUid = d.list.reduce((m, w) => Math.max(m, Number(w.uid) || 0), 0);
  const counter = Number(get('IntData', 'Armory UID Counter')) || 0;
  const uid = Math.max(counter, maxUid + 1);
  d.list.push({
    uid, itemID, currentLevel: level, isExcellent: $('#newWeaponExc').checked,
    currentBenefits: benefits, currentSkills: skills, slot: -1, isNew: true,
  });
  saveArmory(d);
  put('IntData', 'Armory UID Counter', uid + 1);
  render();
  toast(`${itemName(itemID)} adicionada ao Arsenal.`, 'ok');
}

// ---------------------------------------------------------------------------
// eventos
// ---------------------------------------------------------------------------
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-tab]');
  if (!t) return;
  if (t.dataset.tab) {
    state.tab = t.dataset.tab; state.q = ''; state.owned = 'all'; state.rawLimit = 200;
    render(); $('#main').scrollTop = 0;
    return;
  }
  if (t.dataset.owned) { state.owned = t.dataset.owned; render(); return; }
  if (t.dataset.quick) {
    const card = t.closest('.card');
    put('StringData', card.dataset.key, formatForSave(parseNumber(t.dataset.quick)));
    render();
    return;
  }
  if (t.dataset.bulk) return bulk(t.dataset.bulk);
  const act = t.dataset.act;
  if (act === 'more') { state.rawLimit += 300; render(); return; }
  if (act === 'delkey') {
    const tr = t.closest('tr');
    if (!confirm(`Remover a chave "${tr.dataset.key}" do save?`)) return;
    del(tr.dataset.sec, tr.dataset.key);
    render();
    return;
  }
  if (act === 'addkey') {
    const sec = $('#newSec').value, key = $('#newKey').value;
    if (!key) return toast('Informe a chave.', 'err');
    if (state.maps[sec].has(key)) return toast('Essa chave já existe — edite na tabela.', 'err');
    put(sec, key, sec === 'StringData' ? '' : 0);
    if (!setRaw(sec, key, $('#newVal').value)) { del(sec, key); return toast('Valor inválido para esse tipo.', 'err'); }
    state.q = key;
    render();
    return;
  }
  if (act === 'qdone' || act === 'qundo') {
    const id = t.closest('.row').dataset.id;
    if (act === 'qdone') completeQuest(id);
    else if (origGet('IntData', id) === undefined) del('IntData', id);
    else put('IntData', id, origGet('IntData', id));
    state.questSel.delete(id);
    render();
    return;
  }
  if (act === 'qselall') {
    const pending = activeQuests().filter((q) => !questDone(q) && q.goal != null);
    if (state.questSel.size === pending.length) state.questSel.clear();
    else pending.forEach((q) => state.questSel.add(q.id));
    render();
    return;
  }
  if (act === 'qbulk') {
    const n = [...state.questSel].filter(completeQuest).length;
    state.questSel.clear();
    render();
    toast(`${n} ${n === 1 ? 'missão completada' : 'missões completadas'}. Salve e resgate as recompensas no jogo.`, 'ok');
    return;
  }
  if (act === 'wadd') return addWeapon();
  if (act === 'wdel') {
    const idx = Number(t.closest('.weapon').dataset.idx);
    const d = armory();
    const w = d.list[idx];
    const equipped = w.slot !== -1 && w.slot !== undefined;
    if (!confirm(`Remover ${itemName(w.itemID)} do Arsenal?${equipped ? '\n\nEla está equipada — o jogo pode ficar com o slot vazio.' : ''}`)) return;
    d.list.splice(idx, 1);
    saveArmory(d);
    render();
  }
});

function bulk(kind) {
  const tab = tabById(state.tab);
  const items = filtered(tab);
  if (kind === 'set') {
    const v = $('#bulkValue').value;
    if (!Number.isInteger(parseNumber(v))) return toast('Digite um número inteiro para aplicar.', 'err');
    if (!confirm(`Definir ${items.length} itens para ${v}?`)) return;
    for (const i of items) setCount(tab, i.id, v);
  } else {
    const on = kind === 'on';
    if (!confirm(`${on ? 'Marcar' : 'Desmarcar'} ${items.length} itens${state.q || state.owned !== 'all' ? ' (só os filtrados)' : ''}?`)) return;
    for (const i of items) setOwned(tab, i.id, on);
  }
  render();
  toast(`${items.length} itens atualizados. Lembre de salvar.`, 'ok');
}

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const act = el.dataset.act;
  if (!act) return;
  if (act === 'qsel') {
    const id = el.closest('.row').dataset.id;
    if (el.checked) state.questSel.add(id); else state.questSel.delete(id);
    render();
    return;
  }
  if (act === 'qprog') {
    const id = el.closest('.row').dataset.id;
    const n = parseNumber(el.value);
    if (!Number.isInteger(n) || n < 0 || n > 2147483647) { el.classList.add('invalid'); return toast('Progresso precisa ser um número inteiro.', 'err'); }
    if (n === 0 && origGet('IntData', id) === undefined) del('IntData', id);
    else put('IntData', id, n);
    render();
    return;
  }
  const row = el.closest('.row');
  const tab = tabById(state.tab);
  if (row) {
    const id = row.dataset.id;
    if (act === 'own') setOwned(tab, id, el.checked);
    else if (act === 'active') setDivinity(id, undefined, el.checked);
    else if (act === 'count') {
      if (!setCount(tab, id, el.value)) { el.classList.add('invalid'); return toast('Use um número inteiro (ex.: 9999 ou 1e6).', 'err'); }
    } else if (act === 'raw') setRaw('StringData', id, el.value);
    rerenderRow(id);
    return;
  }
  if (act === 'res') {
    const card = el.closest('.card');
    const n = parseNumber(el.value);
    if (!Number.isFinite(n)) { el.classList.add('invalid'); return toast('Número inválido.', 'err'); }
    if (Math.abs(n) > 1e300) toast('Atenção: valores acima de ~1e308 viram infinito no jogo.', 'err');
    put('StringData', card.dataset.key, formatForSave(n));
    render();
    return;
  }
  if (act === 'rawcell') {
    const tr = el.closest('tr');
    if (!setRaw(tr.dataset.sec, tr.dataset.key, el.value)) { el.classList.add('invalid'); return toast(`Valor inválido para ${tr.dataset.sec}.`, 'err'); }
    el.classList.remove('invalid');
    tr.classList.toggle('changed', isChanged(tr.dataset.sec, tr.dataset.key));
    refresh();
    return;
  }
  const wcard = el.closest('.weapon');
  if (wcard) {
    const d = armory();
    const w = d.list[Number(wcard.dataset.idx)];
    if (act === 'wlevel') w.currentLevel = Math.max(1, parseInt(el.value, 10) || 1);
    if (act === 'wexc') w.isExcellent = el.checked;
    if (act === 'wb') w.currentBenefits = [...wcard.querySelectorAll('input[data-act="wb"]:checked')].map((i) => i.value);
    if (act === 'ws') w.currentSkills = [...wcard.querySelectorAll('input[data-act="ws"]:checked')].map((i) => i.value);
    saveArmory(d);
    refresh();
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') {
    state.q = ev.target.value;
    state.rawLimit = 200;
    clearTimeout(document.qTimer);
    document.qTimer = setTimeout(() => {
      const pos = ev.target.selectionStart;
      render();
      const q = $('#q');
      if (q) { q.focus(); q.setSelectionRange(pos, pos); }
    }, 180);
  }
  if (ev.target.dataset.act === 'res') {
    const n = parseNumber(ev.target.value);
    ev.target.classList.toggle('invalid', !Number.isFinite(n));
    ev.target.closest('.card').querySelector('.preview').textContent = Number.isFinite(n) ? `= ${humanNumber(n)}` : 'número inválido';
  }
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'newWeapon') { state.newWeapon = ev.target.value; render(); }
});

// ---------------------------------------------------------------------------
// carregar / salvar
// ---------------------------------------------------------------------------
async function fetchInfo() {
  const r = await fetch('/api/info');
  state.info = await r.json();
  return state.info;
}

function loadBytes(bytes, fileName, source) {
  const { data, format } = decodeSave(bytes);
  state.data = data;
  Object.assign(state, indexData(data));
  state.format = format;
  state.fileName = fileName;
  state.source = source;
  state.sep = detectSep(data);
  render();
}

async function loadFromGame() {
  if (state.data && changes().length && !confirm('Descartar as alterações não salvas e recarregar o save do jogo?')) return;
  try {
    const info = await fetchInfo();
    if (!info.files.some((f) => f.name === 'savedata.sav')) {
      banner(`Não encontrei <b>savedata.sav</b> em ${esc(info.saveDir)}. Use "Abrir arquivo…".`, 'error');
      state.data = null; render();
      return;
    }
    const r = await fetch('/api/save?name=savedata.sav');
    if (!r.ok) throw new Error((await r.json()).error);
    loadBytes(new Uint8Array(await r.arrayBuffer()), 'savedata.sav', 'game');
    showRunningBanner();
    toast('Save do jogo carregado.', 'ok');
  } catch (err) {
    banner(`Erro ao carregar: ${esc(err.message)}`, 'error');
  }
}

function showRunningBanner() {
  if (state.info?.gameRunning) {
    banner('<b>O Idle Slayer está aberto.</b> Feche o jogo antes de salvar — senão ele sobrescreve o save quando fechar.');
  } else {
    banner('');
  }
}

async function saveToGame() {
  const info = await fetchInfo();
  showRunningBanner();
  if (info.gameRunning && !confirm('O jogo está aberto e vai sobrescrever o save ao fechar.\n\nFeche o Idle Slayer primeiro. Salvar mesmo assim?')) return;
  if (state.source === 'file' && !confirm(`Substituir o savedata.sav do jogo pelo arquivo "${state.fileName}" (com as alterações)?\nUm backup do save atual será criado.`)) return;
  const r = await fetch('/api/save?name=savedata.sav', { method: 'PUT', body: encodeSave() });
  const res = await r.json();
  if (!r.ok) return toast(`Erro ao salvar: ${res.error}`, 'err');
  // o que está gravado agora passa a ser o "original"
  Object.assign(state, indexData(state.data));
  state.source = 'game';
  state.fileName = 'savedata.sav';
  await fetchInfo();
  render();
  toast(`Salvo! Backup do anterior: ${res.backup || '(não havia arquivo)'}`, 'ok');
}

function download() {
  const blob = new Blob([encodeSave()], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = state.fileName.endsWith('.sav') ? state.fileName : 'savedata.sav';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function showChanges() {
  const list = changes();
  const fmt = (v) => (v === undefined ? '—' : esc(typeof v === 'string' ? (v.length > 80 ? `${v.slice(0, 80)}…` : v) : JSON.stringify(v)));
  const dlg = $('#dialog');
  dlg.innerHTML = `<h3>${list.length} alterações pendentes</h3>
    <div class="scroll">${list.map((c) => `<div class="change-line">
      <div>${esc(state.catalog[c.key] ? itemName(c.key) : c.key)}<br><code>${esc(c.sec)} · ${esc(c.key)}</code></div>
      <div class="arrow"><span class="old">${fmt(c.old)}</span> → <span class="new">${fmt(c.now)}</span></div>
    </div>`).join('')}</div>
    <div class="dlg-actions"><button data-close>Fechar</button></div>`;
  dlg.showModal();
}

async function showBackups() {
  const info = await fetchInfo();
  const dlg = $('#dialog');
  const fmtDate = (ms) => new Date(ms).toLocaleString('pt-BR');
  dlg.innerHTML = `<h3>Backups</h3>
    <p class="hint">Toda vez que você salva pelo editor, o save anterior vai para <code>${esc(info.saveDir)}\\editor-backups</code>. Restaurar também faz backup do atual antes.</p>
    <div class="scroll">${info.backups.length ? info.backups.map((b) => `<div class="change-line">
      <div>${esc(b.name)}<br><code>${fmtDate(b.mtime)} · ${(b.size / 1024).toFixed(0)} KB</code></div>
      <div><button class="small" data-restore="${esc(b.name)}">Restaurar</button></div>
    </div>`).join('') : '<p class="empty">Nenhum backup ainda.</p>'}</div>
    <h3>Saves na pasta do jogo</h3>
    <div class="scroll">${info.files.map((f) => `<div class="change-line">
      <div>${esc(f.name)}<br><code>${fmtDate(f.mtime)} · ${(f.size / 1024).toFixed(0)} KB</code></div><div></div>
    </div>`).join('')}</div>
    <div class="dlg-actions"><button data-close>Fechar</button></div>`;
  dlg.showModal();
}

$('#dialog').addEventListener('click', async (ev) => {
  if (ev.target.matches('[data-close]') || ev.target === ev.currentTarget) { ev.currentTarget.close(); return; }
  const name = ev.target.dataset.restore;
  if (!name) return;
  if (!confirm(`Restaurar ${name} como savedata.sav?`)) return;
  const r = await fetch(`/api/restore?name=${encodeURIComponent(name)}`, { method: 'POST' });
  const res = await r.json();
  if (!r.ok) return toast(`Erro: ${res.error}`, 'err');
  ev.currentTarget.close();
  state.data = null;
  await loadFromGame();
  toast(`Restaurado ${name}.`, 'ok');
});

$('#btnReload').addEventListener('click', loadFromGame);
$('#btnSave').addEventListener('click', () => saveToGame().catch((e) => toast(`Erro ao salvar: ${e.message}`, 'err')));
$('#btnDownload').addEventListener('click', download);
$('#btnBackups').addEventListener('click', () => showBackups().catch((e) => toast(e.message, 'err')));
$('#btnChanges').addEventListener('click', showChanges);
$('#fileInput').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (state.data && changes().length && !confirm('Descartar as alterações não salvas e abrir outro arquivo?')) return;
  try {
    loadBytes(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
    toast(`${f.name} carregado.`, 'ok');
  } catch (err) {
    toast(err.message, 'err');
  }
});
window.addEventListener('beforeunload', (ev) => {
  if (state.data && changes().length) { ev.preventDefault(); ev.returnValue = ''; }
});

(async function init() {
  render();
  try {
    const [cat, icons] = await Promise.all([
      fetch('/data/catalog.json').then((r) => r.json()),
      fetch('/data/icons.json').then((r) => r.json()).catch(() => ({})),
    ]);
    state.catalog = cat.items || {};
    state.events = cat.events || {};
    state.icons = icons;
  } catch (err) {
    banner(`Não consegui carregar o catálogo de itens (${esc(err.message)}). Rode tools/extrair_catalogo.py.`, 'error');
  }
  await loadFromGame();
})();
