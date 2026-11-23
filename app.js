{
const API = 'https://api.pokemontcg.io/v2/cards';
const CAMPOS = 'id,name,number,images,set,types,rarity,artist,supertype,subtypes';
const CHAVE = 'binderTCG_v1';
const GRADES = { '2x2': [2, 2], '3x3': [3, 3], '4x3': [4, 3] };

const $ = (id) => document.getElementById(id);

let estado = carregar();
let pagina = 0;
let selecionado = null;
let timer = null;
let controle = null;
let encontrados = {};

/* ---------- Salvamento local ---------- */
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s && Array.isArray(s.espacos) && GRADES[s.tamanho]) return s;
  } catch (e) {}
  return { tamanho: '3x3', espacos: [] };
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); }
  catch (e) { avisar('Não foi possível salvar no navegador'); }
}

/* ---------- Utilidades ---------- */
const porPagina = () => GRADES[estado.tamanho][0] * GRADES[estado.tamanho][1];
function ultimoOcupado() {
  for (let i = estado.espacos.length - 1; i >= 0; i--) if (estado.espacos[i]) return i;
  return -1;
}
// sempre sobra pelo menos um espaço vazio no fim, para poder mover cartas
const totalPaginas = () => Math.max(1, Math.ceil((ultimoOcupado() + 2) / porPagina()));
function limparFim() {
  while (estado.espacos.length && !estado.espacos[estado.espacos.length - 1]) estado.espacos.pop();
}
function avisar(txt) {
  const a = $('aviso');
  a.textContent = txt;
  a.classList.add('on');
  clearTimeout(a._t);
  a._t = setTimeout(() => a.classList.remove('on'), 1800);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Abas ---------- */
function abrirAba(nome) {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('ativo', p.id === nome));
  if (nome === 'binder') desenharBinder();
  else $('campoBusca').focus();
}

/* ---------- Busca ---------- */
function numero(n) { return /^\d+$/.test(n) ? String(parseInt(n, 10)) : n.toUpperCase(); }

function montarQuery(t) {
  let m;
  // id da API: sv3-125, swsh12pt5-160
  if (/^[a-z0-9]+-[a-z]*\d+[a-z]*$/i.test(t)) return `id:${t.toLowerCase()}`;
  // sigla + número impresso: OBF 125, OBF 125/197
  if ((m = t.match(/^([a-z]{2,4})\s+([a-z]*\d+[a-z]*)(?:\/\d+)?$/i)))
    return `set.ptcgoCode:${m[1].toUpperCase()} number:${numero(m[2])}`;
  // só número impresso: 125/197
  if ((m = t.match(/^([a-z]*\d+[a-z]*)\/(\d+)$/i)))
    return `number:${numero(m[1])} set.printedTotal:${parseInt(m[2], 10)}`;
  // nome
  const palavras = t.toLowerCase().replace(/[^a-z0-9à-ü\s]/gi, ' ').split(/\s+/).filter(Boolean);
  return palavras.map((p) => `name:${p}*`).join(' ');
}

async function buscar(texto) {
  if (controle) controle.abort();
  controle = new AbortController();
  $('statusBusca').textContent = 'Buscando…';
  const url = `${API}?q=${encodeURIComponent(montarQuery(texto))}&pageSize=30&orderBy=-set.releaseDate&select=${CAMPOS}`;
  try {
    const r = await fetch(url, { signal: controle.signal });
    if (!r.ok) throw new Error(r.status);
    const { data } = await r.json();
    mostrarResultados(data || []);
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('statusBusca').textContent = 'Erro na busca. Verifique a internet e tente de novo.';
  }
}

function mostrarResultados(lista) {
  encontrados = {};
  lista.forEach((c) => (encontrados[c.id] = c));
  $('statusBusca').textContent = lista.length
    ? `${lista.length} carta(s). Toque para adicionar ao binder.`
    : 'Nenhuma carta encontrada.';
  $('resultados').innerHTML = lista.map((c) => `
    <button class="res" data-id="${esc(c.id)}">
      <img src="${esc(c.images.small)}" alt="${esc(c.name)}" loading="lazy">
      <span class="nome">${esc(c.name)}</span>
      <span class="info">${esc(c.set.name)} · ${esc(c.number)}/${esc(c.set.printedTotal)}</span>
    </button>`).join('');
}

function adicionar(c) {
  const carta = {
    id: c.id, nome: c.name, numero: c.number,
    colecao: c.set.name, colecaoId: c.set.id, sigla: c.set.ptcgoCode || '',
    img: c.images.small, imgGrande: c.images.large,
    tipos: c.types || [], raridade: c.rarity || '', artista: c.artist || '',
    categoria: c.supertype || '', subtipos: c.subtypes || []
  };
  let i = estado.espacos.findIndex((e) => !e);
  if (i === -1) i = estado.espacos.length;
  estado.espacos[i] = carta;
  salvar();
  atualizarContador();
  avisar(`${carta.nome} adicionada (página ${Math.floor(i / porPagina()) + 1})`);
}

/* ---------- Binder ---------- */
function atualizarContador() {
  $('contador').textContent = estado.espacos.filter(Boolean).length;
}

function desenharBinder() {
  const [c, l] = GRADES[estado.tamanho];
  const pp = c * l;
  const total = totalPaginas();
  pagina = Math.min(pagina, total - 1);

  document.querySelectorAll('[data-tam]').forEach((b) => b.classList.toggle('ativo', b.dataset.tam === estado.tamanho));
  $('pagInfo').textContent = `${pagina + 1} / ${total}`;
  $('ant').disabled = pagina === 0;
  $('prox').disabled = pagina >= total - 1;

  const el = $('pagina');
  el.style.setProperty('--c', c);
  el.style.setProperty('--l', l);
  let html = '';
  for (let k = 0; k < pp; k++) {
    const i = pagina * pp + k;
    const carta = estado.espacos[i];
    const classes = ['espaco', selecionado === i ? 'sel' : '', selecionado !== null ? 'alvo' : ''].join(' ');
    html += `<button class="${classes}" data-i="${i}" aria-label="${carta ? esc(carta.nome) : 'Espaço vazio'}">` +
      (carta ? `<img src="${esc(carta.img)}" alt="">` : '') + '</button>';
  }
  el.innerHTML = html;
  $('barraSel').hidden = selecionado === null;
}

function tocarEspaco(i) {
  if (selecionado === null) {
    if (estado.espacos[i]) selecionado = i;
  } else if (selecionado === i) {
    selecionado = null;
  } else {
    const a = estado.espacos[selecionado] || null;
    const b = estado.espacos[i] || null;
    estado.espacos[i] = a;
    estado.espacos[selecionado] = b;
    selecionado = null;
    limparFim();
    salvar();
  }
  desenharBinder();
}

function mudarPagina(d) {
  const nova = pagina + d;
  if (nova < 0 || nova >= totalPaginas()) return;
  pagina = nova;
  desenharBinder();
}

/* ---------- Eventos ---------- */
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

$('campoBusca').addEventListener('input', (e) => {
  const t = e.target.value.trim();
  clearTimeout(timer);
  if (t.length < 2) {
    if (controle) controle.abort();
    $('resultados').innerHTML = '';
    $('statusBusca').textContent = 'Digite pelo menos 2 caracteres.';
    return;
  }
  timer = setTimeout(() => buscar(t), 400);
});

$('resultados').addEventListener('click', (e) => {
  const b = e.target.closest('.res');
  if (b && encontrados[b.dataset.id]) adicionar(encontrados[b.dataset.id]);
});

document.querySelectorAll('[data-tam]').forEach((b) => b.addEventListener('click', () => {
  const primeira = pagina * porPagina();
  estado.tamanho = b.dataset.tam;
  pagina = Math.floor(primeira / porPagina());
  salvar();
  desenharBinder();
}));

$('pagina').addEventListener('click', (e) => {
  const b = e.target.closest('.espaco');
  if (b) tocarEspaco(Number(b.dataset.i));
});

$('ant').addEventListener('click', () => mudarPagina(-1));
$('prox').addEventListener('click', () => mudarPagina(1));

$('btnRemover').addEventListener('click', () => {
  if (selecionado === null) return;
  const nome = estado.espacos[selecionado]?.nome;
  estado.espacos[selecionado] = null;
  selecionado = null;
  limparFim();
  salvar();
  atualizarContador();
  desenharBinder();
  if (nome) avisar(`${nome} removida`);
});
$('btnCancelar').addEventListener('click', () => { selecionado = null; desenharBinder(); });

document.addEventListener('keydown', (e) => {
  if (!$('binder').classList.contains('ativo')) return;
  if (e.key === 'ArrowLeft') mudarPagina(-1);
  if (e.key === 'ArrowRight') mudarPagina(1);
  if (e.key === 'Escape') { selecionado = null; desenharBinder(); }
});

atualizarContador();
}
