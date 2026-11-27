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
let backup = null;
let analisando = false;
let iaRodando = false;
let espacoSug = null;      // índice do espaço vazio aberto no painel
let candidatos = {};       // cartas sugeridas para esse espaço
const tentadas = new WeakSet(); // cartas já tentadas nesta sessão
const precisaAnalise = (c) =>
  c && !tentadas.has(c) && (!c.analise || c.analise.versao !== Analise.VERSAO || c.analise.aprox);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Salvamento local ---------- */
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s && Array.isArray(s.espacos) && GRADES[s.tamanho]) return s;
  } catch (e) {}
  return { tamanho: '3x3', espacos: [], ia: false };
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
  a._t = setTimeout(() => a.classList.remove('on'), 2400);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const binderAtivo = () => $('binder').classList.contains('ativo');
function analisesDaPagina(p) {
  const pp = porPagina(), out = [];
  for (let k = 0; k < pp; k++) out.push(estado.espacos[p * pp + k]?.analise || null);
  return out;
}

/* ---------- Abas ---------- */
function abrirAba(nome) {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => p.classList.toggle('ativo', p.id === nome));
  if (nome === 'binder') desenharBinder();
  else $('campoBusca').focus();
}

/* ---------- Busca ---------- */
function numero(n) { return /^\d+$/.test(n) ? String(parseInt(n, 10)) : n.toUpperCase(); }

const PROMOS = ['svp', 'swshp', 'smp', 'xyp', 'bwp', 'hsp', 'dpp', 'np', 'basep'];
const termoNome = (texto) => texto.toLowerCase().replace(/[^a-z0-9à-ü\s]/gi, ' ').split(/\s+/).filter(Boolean)
  // cada palavra vale como palavra inteira OU como começo (art → Articuno; articuno → Articuno)
  .map((p) => `(name:${p} OR name:${p}*)`).join(' ');

function montarQuery(t) {
  let m;
  // id da API: sv3-125, swsh12pt5-160
  if (/^[a-z0-9]+-[a-z]*\d+[a-z]*$/i.test(t)) return `id:${t.toLowerCase()}`;
  // promo: "promo 212", "svp 212"
  if ((m = t.match(/^(promo|svp|swshp|smp|xyp|bwp)\s*#?\s*([a-z]*\d+)$/i))) {
    const ids = m[1].toLowerCase() === 'promo' ? PROMOS : [m[1].toLowerCase()];
    return `(${ids.map((x) => `set.id:${x}`).join(' OR ')}) number:${numero(m[2])}`;
  }
  // sigla + número: OBF 125, OBF 125/197 (também vale como nome + número: "mew 151")
  if ((m = t.match(/^([a-z]{2,4})\s+([a-z]*\d+[a-z]*)(?:\/\d+)?$/i)))
    return `(set.ptcgoCode:${m[1].toUpperCase()} OR set.id:${m[1].toLowerCase()} OR ${termoNome(m[1])}) number:${numero(m[2])}`;
  // só número impresso: 125/197
  if ((m = t.match(/^([a-z]*\d+[a-z]*)\/(\d+)$/i)))
    return `number:${numero(m[1])} set.printedTotal:${parseInt(m[2], 10)}`;
  // só número: 212
  if ((m = t.match(/^#?(\d+)$/))) return `number:${numero(m[1])}`;
  // nome + número: "reuniclus 212", "articuno 144/165"
  if ((m = t.match(/^(.*[a-zà-ü].*?)\s+#?([a-z]*\d+[a-z]*)(?:\/(\d+))?$/i)))
    return `${termoNome(m[1])} number:${numero(m[2])}` + (m[3] ? ` set.printedTotal:${parseInt(m[3], 10)}` : '');
  return termoNome(t);
}

/* Fonte 1: pokemontcg.io (nomes em inglês) */
async function buscarPTCG(texto, signal) {
  const url = `${API}?q=${encodeURIComponent(montarQuery(texto))}&pageSize=30&orderBy=-set.releaseDate&select=${CAMPOS}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(r.status);
  const { data } = await r.json();
  return (data || []).map(montarCarta);
}

/* Fonte 2: TCGdex (nomes em português e inglês, coleções novas) */
const TCGDEX = 'https://api.tcgdex.net/v2';
let idiomaPT = null;     // 'pt-br' ou 'pt', o que a API aceitar
let setsTCGdex = null;   // lista de coleções (para buscar por 255/198)

async function jsonOuNulo(url, signal) {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return null;
  }
}

function cartaTcgdex(d, nomeLocal) {
  if (!d || !d.image) return null;
  return {
    id: 'tcgdex:' + d.id, nome: nomeLocal || d.name, nomeEn: d.name, numero: String(d.localId),
    total: d.set?.cardCount?.official || '', colecao: d.set?.name || '', colecaoId: d.set?.id || '', sigla: '',
    img: d.image + '/low.png', imgGrande: d.image + '/high.png',
    tipos: d.types || [], raridade: d.rarity || '', artista: d.illustrator || '',
    categoria: d.category || '', subtipos: []
  };
}

async function detalhesTcgdex(breves, signal) {
  const lista = await Promise.all(breves.map(async (b) => {
    const d = await jsonOuNulo(`${TCGDEX}/en/cards/${encodeURIComponent(b.id)}`, signal);
    return cartaTcgdex(d, b.nome);
  }));
  return lista.filter(Boolean);
}

async function buscarTCGdex(texto, signal) {
  let m;
  // número impresso: 255/198 (e também TG05/TG30)
  if ((m = texto.match(/^([a-z]*\d+[a-z]*)\s*\/\s*([a-z]*\d+)$/i))) {
    if (!setsTCGdex) setsTCGdex = (await jsonOuNulo(`${TCGDEX}/en/sets`, signal)) || [];
    const total = parseInt(m[2].replace(/\D/g, ''), 10);
    const num = m[1].toUpperCase();
    const sets = setsTCGdex.filter((st) => st.cardCount && st.cardCount.official === total).slice(-12);
    const variantes = [...new Set([num, String(parseInt(num, 10) || num), num.padStart(3, '0')])];
    const achadas = await Promise.all(sets.map(async (st) => {
      for (const v of variantes) {
        const d = await jsonOuNulo(`${TCGDEX}/en/sets/${encodeURIComponent(st.id)}/${encodeURIComponent(v)}`, signal);
        if (d && d.id) return cartaTcgdex(d);
      }
      return null;
    }));
    return achadas.filter(Boolean).reverse();
  }
  // promo: "promo 212", "svp 212"
  if ((m = texto.match(/^(promo|svp|swshp|smp|xyp|bwp)\s*#?\s*([a-z]*\d+)$/i))) {
    const ids = m[1].toLowerCase() === 'promo' ? PROMOS : [m[1].toLowerCase()];
    const n = m[2].toUpperCase(), d3 = n.replace(/\D/g, '').padStart(3, '0');
    const achadas = await Promise.all(ids.map(async (sid) => {
      for (const v of [...new Set([n, String(parseInt(n.replace(/\D/g, ''), 10)), d3, sid.toUpperCase() + d3])]) {
        const d = await jsonOuNulo(`${TCGDEX}/en/sets/${sid}/${encodeURIComponent(v)}`, signal);
        if (d && d.id) return cartaTcgdex(d);
      }
      return null;
    }));
    return achadas.filter(Boolean);
  }
  if (/^#?\d+$/.test(texto)) return []; // só número: a outra fonte cuida
  // nome + número: "reuniclus 212" → busca o nome e filtra pelo número
  let filtroNum = null;
  if ((m = texto.match(/^(.*[a-zà-ü].*?)\s+#?([a-z]*\d+[a-z]*)(?:\/\d+)?$/i))) {
    texto = m[1];
    filtroNum = m[2].replace(/\D/g, '').replace(/^0+/, '');
  }
  // código de carta: sv01-255
  if (/^[a-z0-9.]+-[a-z]*\d+[a-z]*$/i.test(texto)) {
    const d = await jsonOuNulo(`${TCGDEX}/en/cards/${encodeURIComponent(texto.toLowerCase())}`, signal);
    return d ? [cartaTcgdex(d)].filter(Boolean) : [];
  }
  // nome em português (ex.: "bola de ninho") e em inglês
  const q = `name=${encodeURIComponent(texto)}&pagination:page=1&pagination:itemsPerPage=${filtroNum ? 100 : 15}`;
  let pt = null;
  for (const lang of idiomaPT ? [idiomaPT] : ['pt-br', 'pt']) {
    pt = await jsonOuNulo(`${TCGDEX}/${lang}/cards?${q}`, signal);
    if (Array.isArray(pt)) { idiomaPT = lang; break; }
  }
  const en = await jsonOuNulo(`${TCGDEX}/en/cards?${q}`, signal);
  const breves = [];
  const vistos = new Set();
  [...(Array.isArray(pt) ? pt : []), ...(Array.isArray(en) ? en : [])].forEach((b) => {
    if (filtroNum && String(b.localId).replace(/\D/g, '').replace(/^0+/, '') !== filtroNum) return;
    if (!vistos.has(b.id)) { vistos.add(b.id); breves.push({ id: b.id, nome: b.name }); }
  });
  return detalhesTcgdex(breves.slice(0, 20), signal);
}

async function buscar(texto) {
  if (controle) controle.abort();
  controle = new AbortController();
  const signal = controle.signal;
  $('statusBusca').textContent = 'Buscando…';
  // limite de tempo por fonte (a pokemontcg.io às vezes demora muito)
  const comLimite = (p) => Promise.race([p, new Promise((_, n) => setTimeout(() => n(new Error('tempo')), 15000))]);
  const resultados = { a: null, b: null };
  let falhas = 0, prontas = 0;
  const atualizar = () => {
    if (signal.aborted) return;
    // junta as duas fontes sem repetir a mesma carta
    const lista = [], vistos = new Set();
    [...(resultados.b || []), ...(resultados.a || [])].forEach((c) => {
      const chave = `${(c.nomeEn || c.nome).toLowerCase()}|${String(c.numero).replace(/^0+/, '')}|${c.total}`;
      if (!vistos.has(chave)) { vistos.add(chave); lista.push(c); }
    });
    if (lista.length || prontas === 2) mostrarResultados(lista, prontas < 2);
  };
  const rodar = (chave, p) => comLimite(p)
    .then((r) => { resultados[chave] = r; })
    .catch(() => { falhas++; })
    .finally(() => { prontas++; atualizar(); });
  await Promise.all([rodar('a', buscarPTCG(texto, signal)), rodar('b', buscarTCGdex(texto, signal))]);
  if (!signal.aborted && falhas === 2)
    $('statusBusca').textContent = 'Erro na busca. Verifique a internet e tente de novo.';
}

function mostrarResultados(lista, aindaBuscando) {
  encontrados = {};
  lista.forEach((c) => (encontrados[c.id] = c));
  $('statusBusca').textContent = lista.length
    ? `${lista.length} carta(s). Toque para adicionar ao binder.` + (aindaBuscando ? ' Buscando mais…' : '')
    : 'Nenhuma carta encontrada. Tente o nome em inglês ou o número (ex.: 255/198).';
  $('resultados').innerHTML = lista.map((c) => `
    <button class="res" data-id="${esc(c.id)}">
      <img src="${esc(c.img)}" alt="${esc(c.nome)}" loading="lazy">
      <span class="nome">${esc(c.nome)}</span>
      <span class="info">${esc(c.colecao)} · ${esc(c.numero)}${c.total ? '/' + esc(c.total) : ''}</span>
    </button>`).join('');
}

function montarCarta(c) {
  return {
    id: c.id, nome: c.name, nomeEn: c.name, numero: c.number, total: c.set.printedTotal || '',
    colecao: c.set.name, colecaoId: c.set.id, sigla: c.set.ptcgoCode || '',
    img: c.images.small, imgGrande: c.images.large,
    tipos: c.types || [], raridade: c.rarity || '', artista: c.artist || '',
    categoria: c.supertype || '', subtipos: c.subtypes || []
  };
}

function adicionar(carta) {
  carta = { ...carta };
  let i = estado.espacos.findIndex((e) => !e);
  if (i === -1) i = estado.espacos.length;
  estado.espacos[i] = carta;
  backup = null;
  salvar();
  atualizarContador();
  avisar(`${carta.nome} adicionada (página ${Math.floor(i / porPagina()) + 1})`);
  analisarPendentes();
}

/* ---------- Análise visual (em segundo plano) ---------- */
async function analisarPendentes(aoProgredir) {
  if (analisando) return;
  analisando = true;
  try {
    let fila;
    while ((fila = estado.espacos.filter(precisaAnalise)).length) {
      const total = fila.length;
      let feitos = 0;
      await Promise.all([0, 1, 2].map(async () => {
        while (fila.length) {
          const c = fila.shift();
          tentadas.add(c);
          const igual = estado.espacos.find((x) => x && x !== c && x.id === c.id && x.analise &&
            x.analise.versao === Analise.VERSAO && !x.analise.aprox);
          c.analise = igual ? igual.analise : await Analise.analisarCarta(c);
          feitos++;
          if (aoProgredir) aoProgredir(feitos, total);
        }
      }));
      salvar();
    }
  } finally {
    analisando = false;
  }
  if (binderAtivo()) desenharBinder();
  processarIA();
}

/* ---------- IA visual (opcional) ---------- */
async function processarIA(aoProgredir) {
  if (!estado.ia || iaRodando || !window.IA) return;
  iaRodando = true;
  const st = $('statusIA');
  try {
    st.textContent = 'Carregando IA visual…';
    await IA.carregar((p) => {
      if (p && p.status === 'progress' && /\.onnx$/.test(p.file || ''))
        st.textContent = `Baixando IA visual… ${Math.round(p.progress || 0)}% (só na primeira vez)`;
    });
    const fila = estado.espacos.filter((c) => c && c.analise && !c.analise.aprox && !c.analise.emb);
    let f = 0, falhas = 0;
    for (const c of fila) {
      const igual = estado.espacos.find((x) => x && x !== c && x.id === c.id && x.analise && x.analise.emb);
      try {
        c.analise.emb = igual ? igual.analise.emb : await IA.embedding(c, c.analise.estilo >= 1);
      } catch (e) { falhas++; }
      f++;
      st.textContent = `IA visual analisando: ${f}/${fila.length}`;
      if (aoProgredir) aoProgredir(f, fila.length);
      if (f % 5 === 0) salvar();
    }
    salvar();
    const com = estado.espacos.filter((c) => c && c.analise && c.analise.emb).length;
    st.textContent = `IA visual ativa: ${com} carta(s)` + (falhas ? ` · ${falhas} falharam` : '');
  } catch (e) {
    st.textContent = 'Não foi possível carregar a IA visual. Usando só cores e formas.';
  } finally {
    iaRodando = false;
  }
}

/* ---------- Organizar ---------- */
async function organizarBinder() {
  const btn = $('btnOrganizar');
  if (estado.espacos.filter(Boolean).length < 2) return avisar('Adicione pelo menos 2 cartas');
  btn.disabled = true;
  btn.textContent = 'Analisando…';
  await analisarPendentes((f, t) => (btn.textContent = `Analisando ${f}/${t}…`));
  while (analisando) await esperar(300);
  if (estado.ia) {
    btn.textContent = 'IA visual…';
    await processarIA((f, t) => (btn.textContent = `IA ${f}/${t}…`));
    while (iaRodando) await esperar(300);
  }
  btn.textContent = 'Organizando…';
  await esperar(30);
  const [c, l] = GRADES[estado.tamanho];
  backup = estado.espacos.slice();
  const r = Analise.organizar(estado.espacos.filter(Boolean), c, l);
  estado.espacos = r.espacos;
  selecionado = null;
  pagina = 0;
  salvar();
  btn.disabled = false;
  btn.textContent = 'Organizar';
  desenharBinder();
  avisar(r.separadas
    ? `Organizado. ${r.separadas} carta(s) trocada(s) de página por não combinar` +
      (r.semLugar ? `, ${r.semLugar} foram para o fim` : '')
    : 'Binder organizado');
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

  const analises = analisesDaPagina(pagina);
  const temCarta = analises.some(Boolean);
  const el = $('pagina');
  el.style.setProperty('--c', c);
  el.style.setProperty('--l', l);
  let html = '';
  for (let k = 0; k < pp; k++) {
    const i = pagina * pp + k;
    const carta = estado.espacos[i];
    const classes = ['espaco', selecionado === i ? 'sel' : '', selecionado !== null ? 'alvo' : ''].join(' ');
    const soTipo = carta && carta.analise && carta.analise.aprox;
    html += `<button class="${classes}" data-i="${i}" aria-label="${carta ? esc(carta.nome) : 'Espaço vazio'}">` +
      (carta ? `<img src="${esc(carta.img)}" alt="">` : temCarta && selecionado === null ? '<span class="dica">✦</span>' : '') +
      (soTipo ? '<span class="selo" title="Imagem não lida: avaliada só pelo tipo">!</span>' : '') + '</button>';
  }
  el.innerHTML = html;
  $('barraSel').hidden = selecionado === null;
  $('btnDesfazer').hidden = !backup;

  const av = Analise.avaliarPagina(analises, c, l);
  const flow = $('flow');
  flow.textContent = av ? `Flow ${av.total}` : 'Flow —';
  flow.className = 'flow' + (!av ? '' : av.total >= 70 ? ' bom' : av.total >= 45 ? ' medio' : ' fraco');
  $('flowDetalhe').innerHTML = av
    ? [['Cores', 'cores'], ['Fluidez', 'fluidez'], ['Equilíbrio', 'equilibrio'], ['Estilo', 'estilo'], ['Tema', 'tema'], ['Espaços', 'espacos']]
      .map(([n, k]) => `<span>${n} <b>${av.partes[k]}</b></span>`).join('') +
      `<span>Esquema <b>${esc(av.esquema)}</b></span>`
    : '';

  // diagnóstico da leitura das imagens
  const cartas = estado.espacos.filter(Boolean);
  const lidas = cartas.filter((x) => x.analise && !x.analise.aprox && x.analise.versao === Analise.VERSAO).length;
  const soTipo = cartas.filter((x) => x.analise && x.analise.aprox).length;
  const falta = cartas.length - lidas - soTipo;
  $('statusAnalise').textContent = cartas.length
    ? `Imagens lidas: ${lidas}/${cartas.length}` +
      (soTipo ? ` · ${soTipo} só pelo tipo (marcadas com !)` : '') + (falta ? ` · ${falta} aguardando análise` : '')
    : '';
}

function tocarEspaco(i) {
  if (selecionado === null) {
    if (estado.espacos[i]) selecionado = i;
    else if (analisesDaPagina(pagina).some(Boolean)) return abrirSugestao(i);
  } else if (selecionado === i) {
    selecionado = null;
  } else {
    const a = estado.espacos[selecionado] || null;
    const b = estado.espacos[i] || null;
    estado.espacos[i] = a;
    estado.espacos[selecionado] = b;
    selecionado = null;
    backup = null;
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

/* ---------- Sugestão para espaço vazio ---------- */
function dadosEspaco(i) {
  const pp = porPagina(), base = Math.floor(i / pp) * pp;
  const [c, l] = GRADES[estado.tamanho];
  const pos = [], nomes = [];
  for (let k = 0; k < pp; k++) {
    const carta = estado.espacos[base + k];
    pos.push(carta?.analise || null);
    nomes.push(carta?.nome || '');
  }
  return { pos, nomes, k: i - base, c, l };
}

function abrirSugestao(i) {
  const { pos, nomes, k, c, l } = dadosEspaco(i);
  const s = Analise.sugestaoEspaco(pos, k, c, l, nomes);
  if (!s) return;
  espacoSug = i;
  candidatos = {};
  $('sugCores').innerHTML = s.cores.map((cor) =>
    `<span class="amostra"><i style="background:${cor.hex}"></i>${esc(cor.nome)}<small>${cor.hex}</small></span>`).join('') +
    s.bordas.map((b) =>
      `<span class="amostra"><i style="background:${b.hex}"></i>borda ${esc(b.lado)}<small>${b.hex}</small></span>`).join('');
  $('sugTexto').innerHTML = s.texto.map((t) => `<li>${esc(t)}</li>`).join('');
  $('sugStatus').textContent = '';
  $('sugCartas').innerHTML = '';
  $('btnBuscarSug').disabled = false;
  $('btnBuscarSug').dataset.tipo = s.tipo || '';
  $('btnBuscarSug').dataset.estilo = s.estilo;
  $('sugestao').hidden = false;
}

function fecharSugestao() {
  $('sugestao').hidden = true;
  espacoSug = null;
}

async function buscarSugestoes() {
  const i = espacoSug;
  if (i === null) return;
  const btn = $('btnBuscarSug'), st = $('sugStatus');
  btn.disabled = true;
  const tipo = btn.dataset.tipo;
  const especial = Number(btn.dataset.estilo) >= 1;
  let q = tipo ? `types:${tipo}` : 'supertype:pokemon';
  if (especial) q += ' (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare" OR rarity:"Ultra Rare")';
  st.textContent = 'Buscando cartas…';
  try {
    const r = await fetch(`${API}?q=${encodeURIComponent(q)}&pageSize=60&orderBy=-set.releaseDate&select=${CAMPOS}`);
    if (!r.ok) throw new Error(r.status);
    const { data } = await r.json();
    const meus = new Set(estado.espacos.filter(Boolean).map((x) => x.id));
    const lista = (data || []).filter((x) => !meus.has(x.id)).sort(() => Math.random() - 0.5).slice(0, 15);
    const { pos, k, c, l } = dadosEspaco(i);
    const notas = [];
    let f = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (lista.length) {
        const carta = montarCarta(lista.shift());
        const a = await Analise.analisarCarta(carta);
        f++;
        if (espacoSug !== i) return;
        st.textContent = `Testando cartas neste espaço: ${f}/15…`;
        if (a.aprox) continue;
        carta.analise = a;
        notas.push({ carta, nota: Analise.notaCandidato(pos, k, a, c, l) });
      }
    }));
    if (espacoSug !== i) return;
    notas.sort((a, b) => b.nota - a.nota);
    const top = notas.slice(0, 4);
    top.forEach((n) => (candidatos[n.carta.id] = n.carta));
    st.textContent = top.length
      ? 'Melhores encaixes (Flow da página com a carta neste espaço):'
      : 'Não achei cartas para testar. Tente de novo.';
    $('sugCartas').innerHTML = top.map((n) => `
      <div class="res">
        <img src="${esc(n.carta.img)}" alt="${esc(n.carta.nome)}">
        <span class="nome">${esc(n.carta.nome)}</span>
        <span class="info">${esc(n.carta.colecao)} · Flow ${n.nota}</span>
        <button class="colocar" data-id="${esc(n.carta.id)}">Colocar aqui</button>
      </div>`).join('');
  } catch (e) {
    st.textContent = 'Erro ao buscar sugestões. Verifique a internet.';
  }
  btn.disabled = false;
}

/* ---------- Exportar página para revisão ---------- */
let blobExport = null;
async function exportarPagina() {
  const [c, l] = GRADES[estado.tamanho];
  const pp = c * l, base = pagina * pp;
  const cartas = [];
  for (let k = 0; k < pp; k++) cartas.push(estado.espacos[base + k] || null);
  if (!cartas.some(Boolean)) return avisar('Esta página está vazia');
  const btn = $('btnExportar');
  btn.disabled = true;
  btn.textContent = 'Gerando…';

  const cw = 245, ch = 342, gap = 14, pad = 24;
  const cv = document.createElement('canvas');
  cv.width = pad * 2 + c * cw + (c - 1) * gap;
  cv.height = pad * 2 + l * ch + (l - 1) * gap;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#24272d';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const imgs = await Promise.all(cartas.map((carta) => (carta ? Analise.imagemLegivel(carta.img, 245) : null)));
  cartas.forEach((carta, k) => {
    const x = pad + (k % c) * (cw + gap), y = pad + Math.floor(k / c) * (ch + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, cw, ch);
    if (carta && imgs[k]) ctx.drawImage(imgs[k].img, x, y, cw, ch);
    else if (carta) {
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(carta.nome.slice(0, 24), x + 10, y + ch / 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, 26, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(String(k + 1), x + 8, y + 17);
  });

  const av = Analise.avaliarPagina(analisesDaPagina(pagina), c, l);
  const linhas = cartas.map((carta, k) => `${k + 1}. ` +
    (carta ? `${carta.nome} (${carta.colecao} ${carta.numero}${carta.raridade ? ', ' + carta.raridade : ''})` : '(vazio)'));
  $('expTexto').value =
    `Página ${pagina + 1} do meu binder (${c}x${l}). ` +
    (av ? `Flow ${av.total} — Cores ${av.partes.cores}, Fluidez ${av.partes.fluidez}, Equilíbrio ${av.partes.equilibrio}, ` +
      `Estilo ${av.partes.estilo}, Tema ${av.partes.tema}, Espaços ${av.partes.espacos}; esquema ${av.esquema}.\n` : '\n') +
    `Posições da esquerda para a direita, de cima para baixo:\n${linhas.join('\n')}\n\n` +
    'Pode criticar a composição como um diretor de arte e sugerir trocas de posição, cartas para tirar ou que combinariam?';

  blobExport = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
  const url = URL.createObjectURL(blobExport);
  $('expImagem').src = url;
  $('lnkBaixar').href = url;
  $('lnkBaixar').download = `binder-pagina-${pagina + 1}.jpg`;
  $('exportar').hidden = false;
  btn.disabled = false;
  btn.textContent = 'Exportar página';
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
  backup = null;
  limparFim();
  salvar();
  atualizarContador();
  desenharBinder();
  if (nome) avisar(`${nome} removida`);
});
$('btnCancelar').addEventListener('click', () => { selecionado = null; desenharBinder(); });

document.addEventListener('keydown', (e) => {
  if (!binderAtivo()) return;
  if (e.key === 'Escape') { fecharSugestao(); $('exportar').hidden = true; selecionado = null; desenharBinder(); }
  if (!$('sugestao').hidden || !$('exportar').hidden) return;
  if (e.key === 'ArrowLeft') mudarPagina(-1);
  if (e.key === 'ArrowRight') mudarPagina(1);
});

$('btnOrganizar').addEventListener('click', organizarBinder);
$('btnDesfazer').addEventListener('click', () => {
  if (!backup) return;
  estado.espacos = backup;
  backup = null;
  salvar();
  desenharBinder();
  avisar('Organização desfeita');
});

// modo de organização: "tema" (visual + tipo/Pokémon como bônus) ou "visual" (só aparência)
if (!estado.modo) estado.modo = 'tema';
Analise.definirModo(estado.modo);
$('chkTema').checked = estado.modo === 'tema';
$('chkTema').addEventListener('change', (e) => {
  estado.modo = e.target.checked ? 'tema' : 'visual';
  Analise.definirModo(estado.modo);
  salvar();
  desenharBinder();
  avisar(estado.modo === 'tema'
    ? 'Modo visual com tema. Toque em Organizar para aplicar'
    : 'Modo só visual. Toque em Organizar para aplicar');
});

// deixar espaços: prioriza harmonia e deixa vagas (✦) para completar depois
if (estado.espacosLivres === undefined) estado.espacosLivres = true;
Analise.definirEspacos(estado.espacosLivres);
$('chkEspacos').checked = estado.espacosLivres;
$('chkEspacos').addEventListener('change', (e) => {
  estado.espacosLivres = e.target.checked;
  Analise.definirEspacos(estado.espacosLivres);
  salvar();
  desenharBinder();
  avisar(estado.espacosLivres
    ? 'Vai deixar espaços para completar. Toque em Organizar'
    : 'Vai preencher as páginas ao máximo. Toque em Organizar');
});

$('chkIA').checked = !!estado.ia;
$('chkIA').addEventListener('change', (e) => {
  estado.ia = e.target.checked;
  salvar();
  if (estado.ia) processarIA();
  else $('statusIA').textContent = '';
});

$('btnExportar').addEventListener('click', exportarPagina);

// remover todas: pede um segundo toque para confirmar e permite desfazer
$('btnLimpar').addEventListener('click', () => {
  const btn = $('btnLimpar');
  const total = estado.espacos.filter(Boolean).length;
  if (!total) return avisar('O binder já está vazio');
  if (!btn.classList.contains('confirmar')) {
    btn.classList.add('confirmar');
    btn.textContent = `Toque de novo para remover ${total}`;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('confirmar'); btn.textContent = 'Remover todas'; }, 4000);
    return;
  }
  clearTimeout(btn._t);
  btn.classList.remove('confirmar');
  btn.textContent = 'Remover todas';
  backup = estado.espacos.slice();
  estado.espacos = [];
  selecionado = null;
  pagina = 0;
  salvar();
  atualizarContador();
  desenharBinder();
  avisar(`${total} carta(s) removida(s). Use Desfazer se foi sem querer`);
});
$('fecharExp').addEventListener('click', () => ($('exportar').hidden = true));
$('exportar').addEventListener('click', (e) => { if (e.target.id === 'exportar') $('exportar').hidden = true; });
$('btnCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('expTexto').value); avisar('Texto copiado'); }
  catch (e) { $('expTexto').select(); avisar('Selecione e copie o texto'); }
});
$('btnCompartilhar').addEventListener('click', async () => {
  if (!blobExport) return;
  const arq = new File([blobExport], `binder-pagina-${pagina + 1}.jpg`, { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [arq] }))
      await navigator.share({ files: [arq], text: $('expTexto').value });
    else $('lnkBaixar').click();
  } catch (e) { /* compartilhamento cancelado */ }
});
$('fecharSug').addEventListener('click', fecharSugestao);
$('sugestao').addEventListener('click', (e) => { if (e.target.id === 'sugestao') fecharSugestao(); });
$('btnBuscarSug').addEventListener('click', buscarSugestoes);
$('sugCartas').addEventListener('click', (e) => {
  const b = e.target.closest('.colocar');
  if (!b || espacoSug === null || !candidatos[b.dataset.id]) return;
  const carta = candidatos[b.dataset.id];
  estado.espacos[espacoSug] = carta;
  backup = null;
  salvar();
  atualizarContador();
  fecharSugestao();
  desenharBinder();
  avisar(`${carta.nome} colocada no espaço`);
  processarIA();
});

atualizarContador();
analisarPendentes();
}
