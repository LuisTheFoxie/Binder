/* Análise visual das cartas e organização por "flow" */
window.Analise = (() => {
  const W = 60, H = 84; // tamanho reduzido usado na análise
  const PESOS = { cor: 0.35, borda: 0.2, luz: 0.15, traco: 0.15, estilo: 0.15 };
  const CORES_TIPO = {
    Fire: '#e4572e', Water: '#3b8ee6', Grass: '#5bb04a', Lightning: '#f5c518',
    Psychic: '#a65fc0', Fighting: '#b5651d', Darkness: '#2f3640', Metal: '#9aa5b1',
    Dragon: '#c7a008', Fairy: '#e78fc0', Colorless: '#d8d4c8'
  };

  const r1 = (x) => Math.round(x * 10) / 10;
  const lim = (x) => Math.min(1, x);
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /* ---------- Cor: sRGB -> Lab ---------- */
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

  /* ---------- Leitura da imagem ---------- */
  function carregar(src) {
    return new Promise((ok, erro) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = erro;
      i.src = src;
    });
  }

  // tenta várias rotas até conseguir ler os pixels da imagem
  const FONTES = [
    ['direta', (u) => u + (u.includes('?') ? '&' : '?') + 'cors=1'],
    ['wsrv', (u) => 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=120'],
    ['weserv', (u) => 'https://images.weserv.nl/?url=' + encodeURIComponent(u) + '&w=120'],
    ['corsproxy', (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u)]
  ];
  let fontePreferida = 0; // a primeira que funcionar passa a ser tentada antes

  function desenhar(img) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data; // falha se a imagem bloquear leitura
  }

  async function lerPixels(url) {
    const ordem = [fontePreferida, ...FONTES.keys()].filter((v, i, a) => a.indexOf(v) === i);
    for (const k of ordem) {
      const [nome, montar] = FONTES[k];
      try {
        const img = await Promise.race([
          carregar(montar(url)),
          new Promise((_, n) => setTimeout(() => n(new Error('tempo')), 12000))
        ]);
        const data = desenhar(img);
        fontePreferida = k;
        return { data, fonte: nome };
      } catch (e) { /* tenta a próxima */ }
    }
    return null;
  }

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

    const area = (x0, x1, y0, y1) => {
      const out = [];
      for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++)
        for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) out.push(y * W + x);
      return out;
    };
    const media = (idx) => {
      const s = [0, 0, 0];
      idx.forEach((i) => { s[0] += L[i][0]; s[1] += L[i][1]; s[2] += L[i][2]; });
      return s.map((v) => r1(v / idx.length));
    };

    const interior = area(0.06, 0.94, 0.05, 0.95); // sem a moldura externa
    const arte = area(0.08, 0.92, 0.1, 0.55);      // região da ilustração

    // luz e contraste da arte
    let sL = 0, sL2 = 0;
    arte.forEach((i) => { sL += L[i][0]; sL2 += L[i][0] ** 2; });
    const luz = sL / arte.length;
    const contraste = Math.sqrt(Math.max(0, sL2 / arte.length - luz * luz));

    // traço / line-art: densidade de contornos (Sobel)
    const g = (x, y) => L[y * W + x][0] / 100;
    let fortes = 0, total = 0;
    arte.forEach((i) => {
      const x = i % W, y = (i - x) / W;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      const gx = -g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1) + g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1);
      const gy = -g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1) + g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1);
      total++;
      if (Math.hypot(gx, gy) > 0.35) fortes++;
    });

    // carta comum: paleta só da ilustração (ignora a caixa de texto)
    // full art / especial: a carta inteira é arte
    return {
      paleta: paleta((especial ? interior : arte).map((i) => L[i]), 4),
      luz: r1(luz),
      contraste: r1(contraste),
      traco: total ? Math.round((fortes / total) * 1000) / 1000 : 0,
      bordas: {
        esq: media(area(0.06, 0.14, 0.1, 0.55)),
        dir: media(area(0.86, 0.94, 0.1, 0.55)),
        topo: media(area(0.1, 0.9, 0.06, 0.13)),
        base: media(area(0.1, 0.9, 0.86, 0.94))
      }
    };
  }

  // quando a imagem não pode ser lida: usa a cor do tipo
  function aproximada(carta) {
    const c = labHex(CORES_TIPO[(carta.tipos || [])[0]] || '#cfcac0').map(r1);
    return { paleta: [{ lab: c, peso: 1 }], luz: c[0], contraste: 20, traco: 0.15,
      bordas: { esq: c, dir: c, topo: c, base: c }, aprox: true };
  }

  // estilo geral pela raridade: 0 comum, 1 arte especial/full art, 2 dourada/arco-íris
  function estilo(carta) {
    const r = (carta.raridade || '').toLowerCase();
    if (/hyper|secret|rainbow|gold/.test(r)) return 2;
    if (/illustration|ultra|full|gallery|shiny|special|ace|amazing|radiant|character/.test(r)) return 1;
    return 0;
  }

  const VERSAO = 2;

  async function analisarCarta(carta) {
    const est = estilo(carta);
    try {
      const px = await lerPixels(carta.img);
      if (px) return { ...analisarPixels(px.data, est >= 1), estilo: est, fonte: px.fonte, versao: VERSAO };
    } catch (e) {}
    return { ...aproximada(carta), estilo: est, versao: VERSAO };
  }

  /* ---------- Compatibilidade entre cartas ---------- */
  function distPaleta(A, B) {
    const f = (P, Q) => P.reduce((s, p) => s + p.peso * Math.min(...Q.map((q) => dE(p.lab, q.lab))), 0) /
      P.reduce((s, p) => s + p.peso, 0);
    return (f(A, B) + f(B, A)) / 2;
  }
  function termos(a, b) {
    return {
      cor: lim(distPaleta(a.paleta, b.paleta) / 45),
      luz: lim((Math.abs(a.luz - b.luz) / 40) * 0.6 + (Math.abs(a.contraste - b.contraste) / 20) * 0.4),
      traco: lim(Math.abs(a.traco - b.traco) / 0.25),
      estilo: Math.abs(a.estilo - b.estilo) / 2
    };
  }
  // custo entre vizinhas: 'h' = a à esquerda de b; 'v' = a acima de b
  function custoVizinhas(a, b, lado) {
    const t = termos(a, b);
    t.borda = lim((lado === 'h' ? dE(a.bordas.dir, b.bordas.esq) : dE(a.bordas.base, b.bordas.topo)) / 45);
    return Object.keys(PESOS).reduce((s, k) => s + PESOS[k] * t[k], 0);
  }
  function distSequencia(a, b) {
    const t = termos(a, b);
    const w = 1 - PESOS.borda;
    return (PESOS.cor * t.cor + PESOS.luz * t.luz + PESOS.traco * t.traco + PESOS.estilo * t.estilo) / w;
  }

  /* ---------- Nota da página ---------- */
  function notaPagina(pos, c, l) {
    let s = 0, n = 0;
    for (let y = 0; y < l; y++) for (let x = 0; x < c; x++) {
      const a = pos[y * c + x];
      if (!a) continue;
      if (x < c - 1 && pos[y * c + x + 1]) { s += custoVizinhas(a, pos[y * c + x + 1], 'h'); n++; }
      if (y < l - 1 && pos[(y + 1) * c + x]) { s += custoVizinhas(a, pos[(y + 1) * c + x], 'v'); n++; }
    }
    if (!n) return null;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - (s / n) * 1.4))));
  }

  /* ---------- Organização ---------- */
  // 1) sequência de cartas com transição suave (vizinho mais próximo + 2-opt)
  function ordenar(itens) {
    const n = itens.length;
    if (n < 3) return itens;
    const D = itens.map((p) => itens.map((q) => distSequencia(p.a, q.a)));
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

  // 2) melhor posição de cada carta dentro da página (recozimento simulado)
  function arrumarPagina(itens, c) {
    const n = itens.length;
    if (n < 2) return itens;
    const Hm = itens.map((p) => itens.map((q) => custoVizinhas(p.a, q.a, 'h')));
    const Vm = itens.map((p) => itens.map((q) => custoVizinhas(p.a, q.a, 'v')));
    const custo = (o) => {
      let s = 0, k = 0;
      for (let i = 0; i < n; i++) {
        if (i % c < c - 1 && i + 1 < n) { s += Hm[o[i]][o[i + 1]]; k++; }
        if (i + c < n) { s += Vm[o[i]][o[i + c]]; k++; }
      }
      return k ? s / k : 0;
    };
    const o = itens.map((_, i) => i);
    let atual = custo(o), melhor = o.slice(), mc = atual, T = 0.05;
    for (let it = 0; it < 4000; it++) {
      const i = Math.floor(Math.random() * n), j = Math.floor(Math.random() * n);
      if (i === j) continue;
      [o[i], o[j]] = [o[j], o[i]];
      const novo = custo(o);
      if (novo < atual || Math.random() < Math.exp((atual - novo) / T)) {
        atual = novo;
        if (novo < mc) { mc = novo; melhor = o.slice(); }
      } else [o[i], o[j]] = [o[j], o[i]];
      T = Math.max(T * 0.998, 1e-4);
    }
    return melhor.map((i) => itens[i]);
  }

  function organizar(cartas, c, l) {
    const pp = c * l;
    const seq = ordenar(cartas.map((carta) => ({ carta, a: carta.analise })));
    const res = [];
    for (let p = 0; p < seq.length; p += pp)
      arrumarPagina(seq.slice(p, p + pp), c).forEach((it) => res.push(it.carta));
    return res;
  }

  return { analisarCarta, notaPagina, organizar, VERSAO };
})();
