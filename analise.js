/* Análise visual das cartas e organização com direção de arte */
window.Analise = (() => {
  const W = 60, H = 84;   // tamanho reduzido usado na leitura da imagem
  const MW = 6, MH = 8;   // miniatura da arte (usada para montar a página)
  const VERSAO = 3;
  const PESOS = { cores: 0.30, fluidez: 0.25, equilibrio: 0.15, estilo: 0.15, tema: 0.10, espacos: 0.05 };
  const LIMIAR = 0.55;    // compatibilidade mínima com o resto da página

  const CORES_TIPO = {
    Fire: '#e4572e', Water: '#3b8ee6', Grass: '#5bb04a', Lightning: '#f5c518',
    Psychic: '#a65fc0', Fighting: '#b5651d', Darkness: '#2f3640', Metal: '#9aa5b1',
    Dragon: '#c7a008', Fairy: '#e78fc0', Colorless: '#d8d4c8'
  };
  const ELEMENTOS_TIPO = {
    Grass: 'folhas, galhos, musgo e luz filtrada entre árvores',
    Fire: 'brasas, fumaça, rochas vulcânicas e brilho quente',
    Water: 'ondas, bolhas, reflexos e espuma',
    Lightning: 'faíscas, nuvens de tempestade e brilhos elétricos',
    Psychic: 'névoa, cristais, brilhos e formas flutuantes',
    Fighting: 'rochas, terra, poeira e montanhas',
    Darkness: 'sombras, lua, galhos secos e névoa noturna',
    Metal: 'metal escovado, engrenagens e reflexos frios',
    Dragon: 'céu aberto, nuvens, escamas e ventos',
    Fairy: 'pétalas, brilhos, flores e tons pastel',
    Colorless: 'céu, campos abertos e nuvens'
  };

  const r1 = (x) => Math.round(x * 10) / 10;
  const lim = (x) => Math.min(1, x);
  const cl01 = (x) => Math.max(0, Math.min(1, x));
  const media = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /* ---------- Cor: sRGB <-> Lab ---------- */
  function lab(r, g, b) {
    const lin = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
    const R = lin(r), G = lin(g), B = lin(b);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
    const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
    const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const labHex = (h) => lab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
  function hexLab([L, a, b]) {
    const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
    const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const x = f(fx) * 0.95047, y = f(fy), z = f(fz) * 1.08883;
    const rgb = [
      x * 3.2406 + y * -1.5372 + z * -0.4986,
      x * -0.9689 + y * 1.8758 + z * 0.0415,
      x * 0.0557 + y * -0.204 + z * 1.057
    ];
    return '#' + rgb.map((v) => {
      v = v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
      return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
    }).join('');
  }
  function nomeCor([L, a, b]) {
    const C = Math.hypot(a, b);
    if (C < 10) return L > 85 ? 'branco' : L < 22 ? 'preto' : L > 60 ? 'cinza claro' : 'cinza escuro';
    const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    let n;
    if (h >= 40 && h < 80 && L < 45) n = 'marrom';
    else if (h < 20 || h >= 330) n = 'rosa';
    else if (h < 50) n = 'vermelho';
    else if (h < 75) n = 'laranja';
    else if (h < 100) n = 'amarelo';
    else if (h < 150) n = 'verde';
    else if (h < 210) n = 'verde-azulado';
    else if (h < 290) n = 'azul';
    else n = 'roxo';
    if (n !== 'marrom' && L < 35) n += ' escuro';
    else if (n !== 'marrom' && L > 75) n += ' claro';
    return n;
  }

  /* ---------- Leitura da imagem ---------- */
  const FONTES = [
    ['direta', (u) => u + (u.includes('?') ? '&' : '?') + 'cors=1'],
    ['wsrv', (u, w) => 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=' + w],
    ['weserv', (u, w) => 'https://images.weserv.nl/?url=' + encodeURIComponent(u) + '&w=' + w],
    ['corsproxy', (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u)]
  ];
  let fontePreferida = 0;

  function carregar(src) {
    return new Promise((ok, erro) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = erro;
      i.src = src;
    });
  }
  function legivel(img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const x = cv.getContext('2d');
      x.drawImage(img, 0, 0, 1, 1);
      x.getImageData(0, 0, 1, 1);
      return true;
    } catch (e) { return false; }
  }
  // devolve uma imagem cujos pixels podem ser lidos
  async function imagemLegivel(url, largura = 120) {
    const ordem = [fontePreferida, ...FONTES.keys()].filter((v, i, a) => a.indexOf(v) === i);
    for (const k of ordem) {
      const [nome, montar] = FONTES[k];
      try {
        const img = await Promise.race([
          carregar(montar(url, largura)),
          new Promise((_, n) => setTimeout(() => n(new Error('tempo')), 12000))
        ]);
        if (!legivel(img)) continue;
        fontePreferida = k;
        return { img, fonte: nome };
      } catch (e) { /* próxima rota */ }
    }
    return null;
  }
  async function lerPixels(url) {
    const r = await imagemLegivel(url);
    if (!r) return null;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(r.img, 0, 0, W, H);
    return { data: ctx.getImageData(0, 0, W, H).data, fonte: r.fonte };
  }

  // região da ilustração: carta comum = janela da arte; especial = carta inteira
  const regiaoArte = (especial) => (especial ? [0.06, 0.94, 0.05, 0.95] : [0.08, 0.92, 0.11, 0.5]);

  /* ---------- Paleta (k-means em Lab) ---------- */
  function paleta(px, k) {
    const cent = [px[Math.floor(px.length / 2)].slice()];
    while (cent.length < k) {
      let melhor = 0, dist = -1;
      for (let i = 0; i < px.length; i += 3) {
        const d = Math.min(...cent.map((c) => dE(c, px[i])));
        if (d > dist) { dist = d; melhor = i; }
      }
      cent.push(px[melhor].slice());
    }
    let qtd = [];
    for (let it = 0; it < 8; it++) {
      const soma = cent.map(() => [0, 0, 0, 0]);
      for (const p of px) {
        let m = 0, md = Infinity;
        for (let j = 0; j < k; j++) { const d = dE(p, cent[j]); if (d < md) { md = d; m = j; } }
        const s = soma[m]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      }
      soma.forEach((s, j) => { if (s[3]) cent[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
      qtd = soma.map((s) => s[3]);
    }
    return cent
      .map((c, j) => ({ lab: c.map(r1), peso: Math.round((qtd[j] / px.length) * 100) / 100 }))
      .filter((c) => c.peso > 0)
      .sort((a, b) => b.peso - a.peso);
  }

  /* ---------- Análise de uma carta ---------- */
  function analisarPixels(d, especial) {
    const L = new Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    const [x0, x1, y0, y1] = regiaoArte(especial);
    const X0 = Math.floor(x0 * W), X1 = Math.ceil(x1 * W), Y0 = Math.floor(y0 * H), Y1 = Math.ceil(y1 * H);
    const idx = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) idx.push(y * W + x);

    // miniatura MW x MH da arte (cor média de cada bloco)
    const mini = [];
    for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) {
      const ax = X0 + Math.floor((mx * (X1 - X0)) / MW), bx = X0 + Math.floor(((mx + 1) * (X1 - X0)) / MW);
      const ay = Y0 + Math.floor((my * (Y1 - Y0)) / MH), by = Y0 + Math.floor(((my + 1) * (Y1 - Y0)) / MH);
      const s = [0, 0, 0]; let n = 0;
      for (let y = ay; y < Math.max(by, ay + 1); y++) for (let x = ax; x < Math.max(bx, ax + 1); x++) {
        const p = L[y * W + x]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++;
      }
      mini.push(r1(s[0] / n), r1(s[1] / n), r1(s[2] / n));
    }

    // luz, contraste, saturação e temperatura
    let sL = 0, sL2 = 0, sA = 0, sB = 0, sC = 0;
    idx.forEach((i) => {
      const [l, a, b] = L[i];
      sL += l; sL2 += l * l; sA += a; sB += b; sC += Math.hypot(a, b);
    });
    const n = idx.length, luz = sL / n;

    // traço (densidade de contornos) e foco (centro de massa do detalhe)
    const g = (x, y) => L[y * W + x][0] / 100;
    let fortes = 0, total = 0, sm = 0, sx = 0, sy = 0;
    idx.forEach((i) => {
      const x = i % W, y = (i - x) / W;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      const gx = -g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1) + g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1);
      const gy = -g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1) + g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1);
      const m = Math.hypot(gx, gy);
      total++;
      if (m > 0.35) fortes++;
      sm += m; sx += m * x; sy += m * y;
    });
    const cx = (X0 + X1 - 1) / 2, cy = (Y0 + Y1 - 1) / 2;
    const fx = sm ? Math.max(-1, Math.min(1, ((sx / sm - cx) / ((X1 - X0) / 2)) * 2)) : 0;
    const fy = sm ? Math.max(-1, Math.min(1, ((sy / sm - cy) / ((Y1 - Y0) / 2)) * 2)) : 0;

    return {
      paleta: paleta(idx.map((i) => L[i]), 4),
      mini,
      luz: r1(luz),
      contraste: r1(Math.sqrt(Math.max(0, sL2 / n - luz * luz))),
      croma: r1(sC / n),
      temp: r1((sA / n) * 0.4 + sB / n),
      traco: total ? Math.round((fortes / total) * 1000) / 1000 : 0,
      foco: [Math.round(fx * 100) / 100, Math.round(fy * 100) / 100]
    };
  }

  // quando a imagem não pode ser lida: usa a cor do tipo
  function aproximada(carta) {
    const c = labHex(CORES_TIPO[(carta.tipos || [])[0]] || '#cfcac0').map(r1);
    const mini = [];
    for (let i = 0; i < MW * MH; i++) mini.push(...c);
    return { paleta: [{ lab: c, peso: 1 }], mini, luz: c[0], contraste: 20, croma: r1(Math.hypot(c[1], c[2])),
      temp: r1(c[1] * 0.4 + c[2]), traco: 0.15, foco: [0, 0], aprox: true };
  }

  // estilo geral pela raridade: 0 comum, 1 arte especial/full art, 2 dourada/arco-íris
  function estilo(carta) {
    const r = (carta.raridade || '').toLowerCase();
    if (/hyper|secret|rainbow|gold/.test(r)) return 2;
    if (/illustration|ultra|full|gallery|shiny|special|ace|amazing|radiant|character/.test(r)) return 1;
    return 0;
  }

  async function analisarCarta(carta) {
    const est = estilo(carta);
    const extra = { estilo: est, tipos: carta.tipos || [], versao: VERSAO };
    try {
      const px = await lerPixels(carta.img);
      if (px) return { ...analisarPixels(px.data, est >= 1), ...extra, fonte: px.fonte };
    } catch (e) {}
    return { ...aproximada(carta), ...extra };
  }

  /* ---------- Semelhança entre duas cartas (0 a 1) ---------- */
  const cel = (a, x, y) => { const k = (y * MW + x) * 3; return [a.mini[k], a.mini[k + 1], a.mini[k + 2]]; };
  function distPaleta(A, B) {
    const f = (P, Q) => P.reduce((s, p) => s + p.peso * Math.min(...Q.map((q) => dE(p.lab, q.lab))), 0) /
      P.reduce((s, p) => s + p.peso, 0);
    return (f(A, B) + f(B, A)) / 2;
  }
  // semelhança da IA visual (se ativada): vetores guardados x1000
  function simIA(a, b) {
    if (!a.emb || !b.emb || a.emb.length !== b.emb.length) return null;
    let s = 0;
    for (let i = 0; i < a.emb.length; i++) s += a.emb[i] * b.emb[i];
    return cl01((s / 1e6 - 0.55) / 0.4);
  }
  // linguagem visual: paleta + temperatura + saturação (vivo x suave) + luz
  const memo = new WeakMap();
  function simCores(a, b) {
    let m = memo.get(a);
    if (!m) memo.set(a, (m = new Map()));
    if (m.has(b)) return m.get(b);
    const v = cl01(1 - lim(distPaleta(a.paleta, b.paleta) / 45) * 0.55 - lim(Math.abs(a.temp - b.temp) / 40) * 0.15 -
      lim(Math.abs(a.croma - b.croma) / 30) * 0.15 - lim(Math.abs(a.luz - b.luz) / 30) * 0.15);
    m.set(b, v);
    return v;
  }
  function simEstilo(a, b) {
    let s = 1 - (0.45 * Math.abs(a.estilo - b.estilo) / 2 + 0.3 * lim(Math.abs(a.traco - b.traco) / 0.25) +
      0.25 * lim(Math.abs(a.croma - b.croma) / 40));
    const ia = simIA(a, b);
    if (ia !== null) s = 0.5 * s + 0.5 * ia;
    return cl01(s);
  }
  function simTema(a, b) {
    const A = a.tipos || [], B = b.tipos || [];
    let j = !A.length && !B.length ? 0.6 : !A.length || !B.length ? 0.3 :
      A.filter((t) => B.includes(t)).length / new Set([...A, ...B]).size;
    const ia = simIA(a, b);
    if (ia !== null) j = 0.4 * j + 0.6 * ia;
    return j;
  }
  // emenda entre as bordas que se tocam: 'h' = a à esquerda de b; 'v' = a acima de b
  function simCostura(a, b, lado) {
    let s = 0;
    if (lado === 'h') { for (let y = 0; y < MH; y++) s += dE(cel(a, MW - 1, y), cel(b, 0, y)); s /= MH; }
    else { for (let x = 0; x < MW; x++) s += dE(cel(a, x, MH - 1), cel(b, x, 0)); s /= MW; }
    return 1 - lim(s / 40);
  }
  function simFluidez(a, b, lado) {
    return 0.6 * simCostura(a, b, lado) + 0.25 * (1 - lim(Math.abs(a.luz - b.luz) / 40)) +
      0.15 * (1 - lim(Math.abs(a.traco - b.traco) / 0.25));
  }
  function compatComPagina(a, outros) {
    if (!outros.length) return 1;
    const m = (f) => media(outros.map((b) => f(a, b)));
    return 0.5 * m(simCores) + 0.3 * m(simEstilo) + 0.2 * m(simTema);
  }

  /* ---------- Equilíbrio da página montada ---------- */
  // monta a página em baixa resolução com as miniaturas reais e avalia o conjunto
  function equilibrio(pos, c, l) {
    const GW = c * MW, GH = l * MH;
    let sw = 0, sx = 0, sy = 0;
    const pts = [], focos = [];
    let herois = 0, simetricos = 0, n = 0;
    for (let k = 0; k < pos.length; k++) {
      const a = pos[k];
      if (!a) continue;
      n++;
      const px = k % c, py = Math.floor(k / c);
      // massa visual (cor forte e áreas escuras pesam mais)
      for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) {
        const [L, A, B] = cel(a, mx, my);
        const w = Math.hypot(A, B) / 60 + (100 - L) / 200;
        sw += w;
        sx += w * ((px * MW + mx + 0.5) / GW - 0.5);
        sy += w * ((py * MH + my + 0.5) / GH - 0.5);
      }
      pts.push([px, py, a.luz]);
      // foco apontando para dentro da página
      const u = c > 1 ? (px - (c - 1) / 2) / ((c - 1) / 2) : 0;
      const v = l > 1 ? (py - (l - 1) / 2) / ((l - 1) / 2) : 0;
      const [fx, fy] = a.foco || [0, 0];
      if (Math.abs(u) < 1e-9 && Math.abs(v) < 1e-9) focos.push(1 - lim(Math.hypot(fx, fy)));
      else focos.push(cl01(0.5 - (0.5 * (u * fx + v * fy)) / Math.hypot(u, v)));
      // cartas de destaque em posições espelhadas
      if (a.estilo >= 1) {
        herois++;
        if (pos[py * c + (c - 1 - px)] && pos[py * c + (c - 1 - px)].estilo >= 1) simetricos++;
      }
    }
    if (!n) return 0.5;
    const bal = sw ? 1 - lim(Math.hypot(sx / sw, sy / sw) / 0.2) : 0.5;

    // degradê de luz: quanto um plano explica a luz das cartas
    let grad = 0.5;
    if (pts.length >= 3) {
      const mx = media(pts.map((p) => p[0])), my = media(pts.map((p) => p[1])), mL = media(pts.map((p) => p[2]));
      let Sxx = 0, Syy = 0, Sxy = 0, SxL = 0, SyL = 0, SLL = 0;
      pts.forEach(([x, y, L]) => {
        const dx = x - mx, dy = y - my, dl = L - mL;
        Sxx += dx * dx; Syy += dy * dy; Sxy += dx * dy; SxL += dx * dl; SyL += dy * dl; SLL += dl * dl;
      });
      const desvio = Math.sqrt(SLL / pts.length);
      if (desvio < 8) grad = 1; // luz uniforme também é harmonioso
      else {
        const det = Sxx * Syy - Sxy * Sxy;
        let ssr;
        if (Math.abs(det) > 1e-9) {
          const bx = (SxL * Syy - SyL * Sxy) / det, by = (SyL * Sxx - SxL * Sxy) / det;
          ssr = bx * SxL + by * SyL;
        } else ssr = Sxx > 0 ? (SxL * SxL) / Sxx : Syy > 0 ? (SyL * SyL) / Syy : 0;
        grad = lim(ssr / SLL / 0.6);
      }
    }
    const sim = herois === 0 || herois === n ? 1 : simetricos / herois;

    // carta principal: as mais parecidas com ela ficam perto, as diferentes mais longe
    let ancora = 0.5;
    const ocup = [];
    pos.forEach((a, k) => { if (a) ocup.push([a, k % c, Math.floor(k / c)]); });
    if (ocup.length >= 3) {
      const forca = (a) => a.estilo * 100 + a.croma * a.contraste;
      const [pa, ax, ay] = ocup.reduce((m, o) => (forca(o[0]) > forca(m[0]) ? o : m));
      const ds = [], ss = [];
      ocup.forEach(([a, x, y]) => {
        if (a === pa) return;
        ds.push(Math.abs(x - ax) + Math.abs(y - ay));
        ss.push(1 - (0.6 * simCores(pa, a) + 0.4 * simEstilo(pa, a)));
      });
      const md = media(ds), ms = media(ss);
      let sdd = 0, sss = 0, sds = 0;
      ds.forEach((d, i) => { sdd += (d - md) ** 2; sss += (ss[i] - ms) ** 2; sds += (d - md) * (ss[i] - ms); });
      if (sdd > 0 && sss > 1e-6) ancora = cl01((sds / Math.sqrt(sdd * sss) + 1) / 2);
    }
    return 0.25 * bal + 0.15 * grad + 0.2 * media(focos) + 0.15 * sim + 0.25 * ancora;
  }

  /* ---------- Nota da página ---------- */
  function fluidezPagina(pos, c) {
    const s = [];
    for (let k = 0; k < pos.length; k++) {
      if (!pos[k]) continue;
      if (k % c < c - 1 && pos[k + 1]) s.push(simFluidez(pos[k], pos[k + 1], 'h'));
      if (k + c < pos.length && pos[k + c]) s.push(simFluidez(pos[k], pos[k + c], 'v'));
    }
    // cartas encostadas umas nas outras formam um bloco (buracos espalhados ficam feios)
    const n = pos.filter(Boolean).length;
    const coesao = n > 1 ? lim(s.length / (n - 1)) : 1;
    return (s.length ? media(s) : 0.5) * (0.6 + 0.4 * coesao);
  }
  function avaliarPagina(pos, c, l) {
    const cartas = pos.filter(Boolean);
    if (cartas.length < 2) return null;
    const outros = (i) => cartas.filter((_, j) => j !== i);
    const ind = cartas.map((a, i) => ({
      cor: media(outros(i).map((b) => simCores(a, b))),
      est: media(outros(i).map((b) => simEstilo(a, b))),
      tema: media(outros(i).map((b) => simTema(a, b)))
    }));
    // carta destoante derruba a nota (média + pior carta)
    const comPenalidade = (arr) => 0.6 * media(arr) + 0.4 * Math.min(...arr);
    const partes = {
      cores: comPenalidade(ind.map((x) => x.cor)),
      fluidez: fluidezPagina(pos, c),
      equilibrio: equilibrio(pos, c, l),
      estilo: comPenalidade(ind.map((x) => x.est)),
      tema: media(ind.map((x) => x.tema)),
      espacos: cartas.length / (c * l)
    };
    const bruto = Object.keys(PESOS).reduce((s, k) => s + PESOS[k] * partes[k], 0);
    const arred = {};
    Object.keys(partes).forEach((k) => (arred[k] = Math.round(partes[k] * 100)));
    // calibrado com páginas de referência: bagunçada ~35, harmoniosa 75-95
    return { total: Math.round(100 * cl01((bruto - 0.38) / 0.4)), partes: arred };
  }
  function notaCandidato(pos, idx, analise, c, l) {
    const p = pos.slice();
    p[idx] = analise;
    const r = avaliarPagina(p, c, l);
    return r ? r.total : 0;
  }

  /* ---------- Organização ---------- */
  const distSeq = (a, b) => 1 - (0.5 * simCores(a, b) + 0.3 * simEstilo(a, b) + 0.2 * simTema(a, b));

  // 1) sequência do binder com transição suave entre páginas
  function ordenar(itens) {
    const n = itens.length;
    if (n < 3) return itens;
    const D = itens.map((p) => itens.map((q) => distSeq(p.a, q.a)));
    let ini = 0, max = -1;
    for (let i = 0; i < n; i++) { const m = D[i].reduce((s, v) => s + v, 0); if (m > max) { max = m; ini = i; } }
    const usado = new Array(n).fill(false), o = [ini];
    usado[ini] = true;
    while (o.length < n) {
      const u = o[o.length - 1];
      let m = -1, md = Infinity;
      for (let j = 0; j < n; j++) if (!usado[j] && D[u][j] < md) { md = D[u][j]; m = j; }
      o.push(m); usado[m] = true;
    }
    const inverter = (i, j) => { while (i < j) { [o[i], o[j]] = [o[j], o[i]]; i++; j--; } };
    for (let volta = 0, mudou = true; mudou && volta < 20; volta++) {
      mudou = false;
      for (let i = -1; i < n - 2; i++) for (let j = i + 2; j < n; j++) {
        const d = j + 1 < n ? o[j + 1] : null;
        const antes = (i >= 0 ? D[o[i]][o[i + 1]] : 0) + (d !== null ? D[o[j]][d] : 0);
        const depois = (i >= 0 ? D[o[i]][o[j]] : 0) + (d !== null ? D[o[i + 1]][d] : 0);
        if (depois < antes - 1e-9) { inverter(i + 1, j); mudou = true; }
      }
    }
    return o.map((i) => itens[i]);
  }

  // 2) melhor composição da página (espaços vazios também podem mudar de lugar)
  function arrumarPagina(itens, c, l) {
    const pp = c * l, n = itens.length;
    const A = itens.map((i) => i.a);
    const pos = new Array(pp).fill(-1);
    for (let i = 0; i < n; i++) pos[i] = i;
    if (n < 2) return pos.map((i) => (i < 0 ? null : itens[i]));
    const Hm = A.map((a) => A.map((b) => simFluidez(a, b, 'h')));
    const Vm = A.map((a) => A.map((b) => simFluidez(a, b, 'v')));
    const valor = () => {
      let s = 0, k = 0;
      for (let p = 0; p < pp; p++) {
        const i = pos[p];
        if (i < 0) continue;
        if (p % c < c - 1 && pos[p + 1] >= 0) { s += Hm[i][pos[p + 1]]; k++; }
        if (p + c < pp && pos[p + c] >= 0) { s += Vm[i][pos[p + c]]; k++; }
      }
      const eq = equilibrio(pos.map((i) => (i < 0 ? null : A[i])), c, l);
      const coesao = lim(k / (n - 1));
      return PESOS.fluidez * (k ? s / k : 0.5) * (0.6 + 0.4 * coesao) + PESOS.equilibrio * eq;
    };
    let atual = valor(), melhor = pos.slice(), mv = atual, T = 0.02;
    for (let it = 0; it < 2500; it++) {
      const i = Math.floor(Math.random() * pp), j = Math.floor(Math.random() * pp);
      if (i === j || (pos[i] < 0 && pos[j] < 0)) continue;
      [pos[i], pos[j]] = [pos[j], pos[i]];
      const novo = valor();
      if (novo > atual || Math.random() < Math.exp((novo - atual) / T)) {
        atual = novo;
        if (novo > mv) { mv = novo; melhor = pos.slice(); }
      } else [pos[i], pos[j]] = [pos[j], pos[i]];
      T = Math.max(T * 0.998, 1e-5);
    }
    return melhor.map((i) => (i < 0 ? null : itens[i]));
  }

  // corta a sequência em páginas onde a mudança visual é maior:
  // prefere deixar espaço vazio a misturar dois grupos que não combinam
  function dividirPaginas(seq, pp) {
    const n = seq.length;
    if (n <= 1) return n ? [seq] : [];
    const S = seq.map((p) => seq.map((q) => 1 - distSeq(p.a, q.a)));
    const custoSeg = (i, j) => { // cartas i..j-1
      const m = j - i;
      if (m < 2) return 0;
      let s = 0;
      for (let x = i; x < j; x++) {
        let t = 0;
        for (let y = i; y < j; y++) if (y !== x) t += S[x][y];
        s += 1 - t / (m - 1);
      }
      return s;
    };
    const VAZIO = 0.25; // "preço" de cada espaço vazio
    const best = new Array(n + 1).fill(Infinity), corte = new Array(n + 1).fill(0);
    best[0] = 0;
    for (let j = 1; j <= n; j++)
      for (let i = Math.max(0, j - pp); i < j; i++) {
        const v = best[i] + custoSeg(i, j) + VAZIO * (pp - (j - i));
        if (v < best[j]) { best[j] = v; corte[j] = i; }
      }
    const paginas = [];
    for (let j = n; j > 0; j = corte[j]) paginas.unshift(seq.slice(corte[j], j));
    return paginas;
  }

  function organizar(cartas, c, l) {
    const pp = c * l;
    const seq = ordenar(cartas.map((carta) => ({ carta, a: carta.analise })));
    const paginas = dividirPaginas(seq, pp);

    // 3) tira da página a carta que destoa (até 1/3 da página)
    const avulsas = [];
    paginas.forEach((pg) => {
      let max = Math.floor(pp / 3);
      while (pg.length > 2 && max-- > 0) {
        const notas = pg.map((it) => compatComPagina(it.a, pg.filter((x) => x !== it).map((x) => x.a)));
        let k = 0;
        notas.forEach((v, i) => { if (v < notas[k]) k = i; });
        if (notas[k] >= LIMIAR) break;
        avulsas.push(pg.splice(k, 1)[0]);
      }
    });

    // 4) tenta encaixar cada carta separada em outra página com vaga
    const sobra = [];
    avulsas.forEach((it) => {
      let melhor = -1, mn = LIMIAR;
      paginas.forEach((pg, i) => {
        if (pg.length >= pp) return;
        const nt = compatComPagina(it.a, pg.map((x) => x.a));
        if (nt > mn) { mn = nt; melhor = i; }
      });
      if (melhor >= 0) paginas[melhor].push(it);
      else sobra.push(it);
    });
    // as que não combinam com nenhuma página vão juntas para o fim
    dividirPaginas(ordenar(sobra), pp).forEach((pg) => paginas.push(pg));

    const espacos = [];
    paginas.forEach((pg) => arrumarPagina(pg, c, l).forEach((x) => espacos.push(x ? x.carta : null)));
    while (espacos.length && !espacos[espacos.length - 1]) espacos.pop();
    return { espacos, separadas: avulsas.length, semLugar: sobra.length };
  }

  /* ---------- Sugestão para espaço vazio ---------- */
  function sugestaoEspaco(pos, idx, c, l, nomes) {
    const cartas = pos.filter(Boolean);
    if (!cartas.length) return null;
    const px = idx % c, py = Math.floor(idx / c);

    // paleta da página: junta as cores de todas as cartas e funde as parecidas
    let pool = [];
    cartas.forEach((a) => a.paleta.forEach((p) => pool.push({ lab: p.lab.slice(), peso: p.peso / cartas.length })));
    pool.sort((a, b) => b.peso - a.peso);
    const fundidas = [];
    pool.forEach((p) => {
      const f = fundidas.find((q) => dE(q.lab, p.lab) < 14);
      if (f) {
        const t = f.peso + p.peso;
        f.lab = f.lab.map((v, i) => (v * f.peso + p.lab[i] * p.peso) / t);
        f.peso = t;
      } else fundidas.push(p);
    });
    fundidas.sort((a, b) => b.peso - a.peso);
    const cores = fundidas.slice(0, 3).map((f) => ({ hex: hexLab(f.lab), nome: nomeCor(f.lab), peso: f.peso }));

    // bordas das vizinhas que encostam neste espaço
    const bordas = [];
    const viz = (k, lado) => {
      const a = pos[k];
      if (!a) return;
      const cs = [];
      if (lado === 'esquerdo') for (let y = 0; y < MH; y++) cs.push(cel(a, MW - 1, y));
      if (lado === 'direito') for (let y = 0; y < MH; y++) cs.push(cel(a, 0, y));
      if (lado === 'de cima') for (let x = 0; x < MW; x++) cs.push(cel(a, x, MH - 1));
      if (lado === 'de baixo') for (let x = 0; x < MW; x++) cs.push(cel(a, x, 0));
      const m = [0, 1, 2].map((i) => media(cs.map((v) => v[i])));
      bordas.push({ lado, hex: hexLab(m), nome: nomeCor(m), carta: (nomes && nomes[k]) || 'a carta vizinha', a });
    };
    if (px > 0) viz(idx - 1, 'esquerdo');
    if (px < c - 1) viz(idx + 1, 'direito');
    if (py > 0) viz(idx - c, 'de cima');
    if (py < l - 1) viz(idx + c, 'de baixo');

    const luz = media(cartas.map((a) => a.luz));
    const temp = media(cartas.map((a) => a.temp));
    const croma = media(cartas.map((a) => a.croma));
    const tracoViz = bordas.length ? media(bordas.map((b) => b.a.traco)) : media(cartas.map((a) => a.traco));
    const est = Math.round(media(cartas.map((a) => a.estilo)));
    const contagem = {};
    cartas.forEach((a) => (a.tipos || []).forEach((t) => (contagem[t] = (contagem[t] || 0) + 1)));
    let tipo = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0];
    if (!tipo) {
      // sem tipo (treinadores): usa o tipo cuja cor mais se parece com a cor principal
      const principal = fundidas[0].lab;
      tipo = Object.keys(CORES_TIPO).sort((a, b) => dE(labHex(CORES_TIPO[a]), principal) - dE(labHex(CORES_TIPO[b]), principal))[0];
    }

    const u = c > 1 ? px - (c - 1) / 2 : 0, v = l > 1 ? py - (l - 1) / 2 : 0;
    const dir = [];
    if (u < 0) dir.push('mais à direita'); if (u > 0) dir.push('mais à esquerda');
    if (v < 0) dir.push('mais para baixo'); if (v > 0) dir.push('mais para cima');

    const texto = [];
    texto.push(`Arte em ${cores[0].nome} (${cores[0].hex})` +
      (cores[1] ? ` e ${cores[1].nome} (${cores[1].hex})` : '') +
      (cores[2] ? `, com toques de ${cores[2].nome}` : '') + '.');
    texto.push(`Luz ${luz > 65 ? 'clara' : luz > 40 ? 'média' : 'escura'}, cores ${temp > 8 ? 'quentes' : temp < -8 ? 'frias' : 'neutras'} e ${croma > 45 ? 'intensas' : croma > 25 ? 'equilibradas' : 'suaves'}.`);
    texto.push(tracoViz > 0.2
      ? 'Pouco detalhe: uma área de respiro (céu, névoa, água calma ou textura lisa), porque as cartas ao redor já são bem detalhadas.'
      : tracoViz < 0.1
        ? 'Pode ter mais detalhe e textura, porque as cartas ao redor são calmas.'
        : 'Detalhe moderado, no mesmo nível das cartas ao redor.');
    bordas.forEach((b) => texto.push(`Lado ${b.lado}: continuar o ${b.nome} (${b.hex}) da borda de ${b.carta}.`));
    texto.push(dir.length
      ? `Ponto de interesse ${dir.join(' e ')}, levando o olhar para o centro da página.`
      : 'Ponto de interesse no centro, servindo de âncora para a página.');
    texto.push(`Elementos que conversam com a página: ${ELEMENTOS_TIPO[tipo] || ELEMENTOS_TIPO.Colorless}.`);
    if (est >= 1) texto.push('Acabamento de arte cheia, como as cartas especiais da página.');

    return { cores, bordas: bordas.map(({ a, ...b }) => b), texto, tipo, estilo: est };
  }

  return { VERSAO, analisarCarta, avaliarPagina, notaCandidato, organizar, sugestaoEspaco, imagemLegivel, regiaoArte };
})();
