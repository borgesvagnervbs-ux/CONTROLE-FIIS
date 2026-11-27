/* Tela principal: carteira (salva no navegador), dados de mercado (dados/mercado.json),
   análise por FII e relatório geral. */
(function () {
  "use strict";
  const { BRL, N0, N2, N3, PCT, el, renderMd, calc, corTipo, fmtData, ler, gravar, apagar } = window.U;
  const $ = (id) => document.getElementById(id);

  /* Carteira inicial: a mesma da planilha (aba TABELA FIIS). */
  const CARTEIRA_INICIAL = [
    ["RZAG11", "FIAGRO", 74, 7.26, 0.13], ["DCRA11", "FIAGRO", 77, 5.2, 0.09], ["AGRX11", "FIAGRO", 75, 7.38, 0.12],
    ["VGIA11", "FIAGRO", 80, 7.63, 0.12], ["MCRE11", "PAPEL", 26, 6.47, 0.1], ["VGIR11", "PAPEL", 48, 8.21, 0.119],
    ["FGAA11", "FIAGRO", 77, 7.63, 0.11], ["XPCA11", "FIAGRO", 78, 6.49, 0.09], ["SNEL11", "ENERGIA", 29, 7.28, 0.1],
    ["RURA11", "FIAGRO", 76, 7.44, 0.1], ["MANA11", "PAPEL", 85, 8.34, 0.11], ["SNAG11", "FIAGRO", 29, 9.35, 0.12],
    ["BTHF11", "FOF", 31, 7.98, 0.101], ["RBRX11", "FOF", 12, 6.42, 0.08], ["GGRC11", "TIJOLO", 29, 8.23, 0.1],
    ["KISU11", "FOF", 29, 6.2, 0.07], ["MXRF11", "PAPEL", 29, 8.46, 0.095], ["BTCI11", "PAPEL", 29, 7.82, 0.085],
    ["GARE11", "TIJOLO", 29, 8.01, 0.083], ["KNSC11", "PAPEL", 29, 8.19, 0.08]
  ].map(([id, tipo, qtd, cotacao, dividendo]) => ({ id, tipo, qtd, cotacao, dividendo }));

  let carteira = ler("fiis.carteira", null) || CARTEIRA_INICIAL.map(f => ({ ...f }));
  let cfg = ler("fiis.cfg", { meta: 100, anos: 1 });
  let analises = ler("fiis.analises", {});
  let relatorio = ler("fiis.relatorio", null);
  let mercado = { fiis: {}, ranking: [], erros: {} };
  let ocupado = false, ctl = null;
  let linhaSel = null;

  const salvarCarteira = () => { if (!gravar("fiis.carteira", carteira)) setStatus("Não foi possível salvar neste navegador (modo anônimo?)."); };
  const setStatus = (t) => { $("status").textContent = t; };

  /* Junta a carteira com os dados de mercado mais recentes. */
  function fiisAtuais() {
    return carteira.map(b => {
      const m = mercado.fiis[b.id];
      const f = { ...b, extra: {}, atualizadoEm: null };
      if (m) {
        if (m.cotacao > 0) f.cotacao = m.cotacao;
        if (m.dividendo > 0) f.dividendo = m.dividendo;
        f.extra = m; f.atualizadoEm = m.atualizadoEm || null;
      }
      return f;
    });
  }

  /* Sobra (+, verde) ou falta (−, vermelho) de cotas em relação ao número mágico. */
  function magicoTd(sobra) {
    const n = Math.round(sobra);
    if (!Number.isFinite(n)) return el("td", { class: "num", text: "–" });
    const txt = n > 0 ? "+" + N0.format(n) : n < 0 ? "\u2212" + N0.format(-n) : "0";
    return el("td", { class: "num " + (n > 0 ? "pos" : n < 0 ? "neg" : ""), text: txt, title: n >= 0 ? "Cotas a mais que o número mágico" : "Cotas que faltam para o número mágico" });
  }

  function numTd(v, fmt, cls) { return el("td", { class: "num " + (cls || ""), text: Number.isFinite(v) ? fmt.format(v) : "–" }); }

  const TIPOS_ORDEM = ["FIAGRO", "PAPEL", "TIJOLO", "FOF", "ENERGIA", "HÍBRIDO"];
  let ordem = ler("fiis.ordem", null);          // {chave, dir: 1 | -1}
  let filtroTipos = null;                       // null = todos; senão Set de tipos (sempre abre com todos)

  function valorOrdem(r, chave) {
    if (chave === "tk") return r.f.id;
    if (chave === "pvp") return r.pvp;
    if (chave === "sobra") return r.c.C - r.c.J;
    return r.c[chave];
  }

  function render() {
    const fiis = fiisAtuais();
    const todas = fiis.map(f => ({ f, c: calc(f, cfg), pvp: Number.isFinite(f.extra.pvp) ? f.extra.pvp : NaN }));
    let linhas = filtroTipos ? todas.filter(r => filtroTipos.has(r.f.tipo || "OUTRO")) : todas.slice();
    if (ordem && ordem.chave) {
      linhas.sort((x, y) => {
        const a = valorOrdem(x, ordem.chave), b = valorOrdem(y, ordem.chave);
        if (typeof a === "string") return a.localeCompare(b) * ordem.dir;
        const na = Number.isFinite(a), nb = Number.isFinite(b);
        if (!na || !nb) return na === nb ? 0 : na ? -1 : 1;   // sem dado sempre no fim
        return (a - b) * ordem.dir;
      });
    }
    for (const th of document.querySelectorAll("th[data-sort]")) th.setAttribute("aria-sort", ordem && ordem.chave === th.dataset.sort ? (ordem.dir > 0 ? "ascending" : "descending") : "none");

    const tb = $("tbody"); tb.textContent = "";
    if (!fiis.length) tb.append(el("tr", {}, el("td", { class: "empty", colspan: "22", text: "Nenhum FII na carteira. Adicione o primeiro no formulário abaixo." })));
    else if (!linhas.length) tb.append(el("tr", {}, el("td", { class: "empty", colspan: "22", text: "Nenhum FII dos tipos selecionados." })));
    const tot = { C: 0, F: 0, Gs: 0, Gn: 0, I: 0, J: 0, M: 0, N: 0, O: 0, P: 0, R: 0, L: 0 };
    for (const { f, c, pvp } of linhas) {
      tot.C += c.C; tot.F += c.F; if (c.D) { tot.Gs += c.G; tot.Gn++; } tot.I += c.I; tot.J += c.J; tot.M += c.M; tot.N += c.N; tot.O += c.O; tot.P += c.P; tot.R += c.R; tot.L += c.L;
      const t = f.tipo || "OUTRO";

      const qty = el("input", { class: "qty", type: "number", min: "0", step: "1", id: "qty-" + f.id, "aria-label": "Quantidade de " + f.id });
      qty.value = c.C;
      qty.addEventListener("change", () => {
        const b = carteira.find(x => x.id === f.id); if (!b) return;
        b.qtd = Math.max(0, Math.round(+qty.value || 0)); salvarCarteira(); render();
      });

      const tk = el("td", { class: "tk" }, el("b", { text: f.id }));
      const erro = mercado.erros && mercado.erros[f.id];
      tk.append(el("span", { class: "rowstate" + (erro && !f.atualizadoEm ? " err" : ""), text: f.atualizadoEm ? "dados de " + fmtData(f.atualizadoEm) : erro ? "não atualizado" : "valores da planilha", title: erro || "" }));

      const chip = el("span", { class: "chip tipo", text: t }); chip.style.color = corTipo(t);
      const an = el("td", { class: "l" });
      const a = analises[f.id];
      if (a && a.veredito) an.append(el("span", { class: "chip v-" + a.veredito, text: a.veredito }), " ");
      an.append(el("button", { class: "iconbtn", type: "button", text: a ? "Ver / refazer" : "Analisar", disabled: ocupado, onclick: () => abrirAnalise(f.id) }));

      // cores: P/VP acima de 1 vermelho, abaixo verde; DY mensal a partir de 1% verde (DY anual a partir de 12%)
      const corPvp = Number.isFinite(pvp) ? (pvp > 1 ? "neg" : pvp < 1 ? "pos" : "") : "";
      const corDyM = c.D ? (c.G >= 0.01 ? "pos" : "neg") : "";
      const corDyA = c.D ? (c.H >= 0.12 ? "pos" : "neg") : "";

      const tr = el("tr", { class: linhaSel === f.id ? "sel" : null, "data-id": f.id });
      tb.append(tr);
      tr.append(
        tk, el("td", { class: "l" }, chip), el("td", {}, qty),
        numTd(c.D, BRL), numTd(c.E, N3), numTd(c.F, BRL), numTd(c.G, PCT, corDyM), numTd(c.H, PCT, corDyA),
        numTd(pvp, N2, corPvp),
        numTd(c.I, BRL), numTd(c.J, N0), magicoTd(c.C - c.J), numTd(c.L, N0), numTd(c.M, N0, c.M <= 0 ? "pos" : ""),
        numTd(c.N, BRL), numTd(c.O, BRL), numTd(c.P, BRL), numTd(c.Q, N0), numTd(c.R, BRL), numTd(c.S, BRL),
        an, el("td", {}, botaoRemover(f.id)));
    }
    const GavgF = tot.Gn ? tot.Gs / tot.Gn : 0;
    const tf = $("tfoot"); tf.textContent = "";
    if (linhas.length) tf.append(el("tr", {}, el("td", { class: "tk", text: filtroTipos ? "Total filtrado" : "Total" }), el("td", { class: "l", text: linhas.length + " FIIs" }),
      numTd(tot.C, N0), el("td"), el("td"), numTd(tot.F, BRL), numTd(GavgF, PCT, GavgF ? (GavgF >= 0.01 ? "pos" : "neg") : ""), numTd(GavgF * 12, PCT, GavgF ? (GavgF * 12 >= 0.12 ? "pos" : "neg") : ""), el("td"), numTd(tot.I, BRL),
      numTd(tot.J, N0), magicoTd(tot.C - tot.J), numTd(tot.L, N0), numTd(tot.M, N0), numTd(tot.N, BRL), numTd(tot.O, BRL), numTd(tot.P, BRL),
      numTd(Math.max(1, +cfg.anos || 1), N0), numTd(tot.R, BRL), numTd(tot.R - tot.F, BRL), el("td"), el("td")));

    // resumo e gráfico sempre com a carteira inteira
    const G = { C: 0, F: 0, Gs: 0, Gn: 0, I: 0, M: 0, N: 0, R: 0 };
    const porTipo = {};
    for (const { f, c } of todas) {
      G.C += c.C; G.F += c.F; if (c.D) { G.Gs += c.G; G.Gn++; } G.I += c.I; G.M += c.M; G.N += c.N; G.R += c.R;
      const t = f.tipo || "OUTRO"; porTipo[t] = porTipo[t] || { n: 0, v: 0 }; porTipo[t].n++; porTipo[t].v += c.I;
    }
    const Gavg = G.Gn ? G.Gs / G.Gn : 0;
    montarFiltro(Object.keys(porTipo));
    const k = $("kpis"); k.textContent = "";
    const kpi = (r, v, s2) => k.append(el("div", { class: "kpi" }, el("span", { class: "eyebrow", text: r }), el("span", { class: "v", text: v }), el("span", { class: "s", text: s2 })));
    kpi("Patrimônio atual", BRL.format(G.I), N0.format(G.C) + " cotas em " + fiis.length + " FIIs");
    kpi("Dividendos por mês", BRL.format(G.F), BRL.format(G.F * 12) + " por ano");
    kpi("DY médio", PCT.format(Gavg) + " a.m.", PCT.format(Gavg * 12) + " ao ano");
    kpi("Falta para a meta", BRL.format(G.N), N0.format(G.M) + " cotas no total");
    kpi("Investir por mês", BRL.format(G.R), BRL.format(Math.max(0, G.R - G.F)) + " reinvestindo os dividendos");
    desenharPizza(porTipo, G.I);
    $("btnRelatorio").disabled = ocupado || !fiis.length;
    $("btnRecarregar").disabled = ocupado;
    $("btnAtualizarAgora").disabled = ocupado;
    $("btnParar").hidden = !ocupado;
    ajustarRolagemTopo();
    $("tickersJson").value = JSON.stringify(carteira.map(f => ({ ticker: f.id, tipo: f.tipo })), null, 1);
  }

  /* ---------- gráfico de pizza ---------- */
  function desenharPizza(porTipo, total) {
    const svg = $("allocPie"), lg = $("allocLegend"), NS = "http://www.w3.org/2000/svg";
    svg.textContent = ""; lg.textContent = "";
    const tipos = Object.keys(porTipo).sort((a, b) => porTipo[b].v - porTipo[a].v);
    let ang = -Math.PI / 2;
    const R = 100;
    for (const t of tipos) {
      const p = total ? porTipo[t].v / total : 0;
      const cor = corTipo(t);
      let forma;
      if (p >= 0.9999) { forma = document.createElementNS(NS, "circle"); forma.setAttribute("r", R); }
      else if (p > 0) {
        const a2 = ang + p * 2 * Math.PI;
        const x1 = R * Math.cos(ang), y1 = R * Math.sin(ang), x2 = R * Math.cos(a2), y2 = R * Math.sin(a2);
        forma = document.createElementNS(NS, "path");
        forma.setAttribute("d", `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`);
        if (p >= 0.08) {
          const meio = ang + p * Math.PI, tx = document.createElementNS(NS, "text");
          tx.setAttribute("x", (R * 0.62 * Math.cos(meio)).toFixed(1)); tx.setAttribute("y", (R * 0.62 * Math.sin(meio) + 4).toFixed(1));
          tx.setAttribute("text-anchor", "middle"); tx.textContent = Math.round(p * 100) + "%";
          tx.style.fill = "#fff"; tx.style.paintOrder = "stroke"; tx.style.stroke = "rgba(0,0,0,.35)"; tx.style.strokeWidth = "2px";
          ang = a2; svg.append(forma); forma.style.fill = cor;
          const tt = document.createElementNS(NS, "title"); tt.textContent = `${t}: ${PCT.format(p)}`; forma.append(tt);
          svg.append(tx);
          lg.append(legendaItem(t, porTipo[t].n, p));
          continue;
        }
        ang = a2;
      }
      if (forma) { forma.style.fill = cor; const tt = document.createElementNS(NS, "title"); tt.textContent = `${t}: ${PCT.format(p)}`; forma.append(tt); svg.append(forma); }
      lg.append(legendaItem(t, porTipo[t].n, p));
    }
  }
  function legendaItem(t, n, p) {
    const i = el("i"); i.style.background = corTipo(t);
    return el("span", {}, i, `${t}: ${n} FII${n > 1 ? "s" : ""} · ${PCT.format(p)}`);
  }

  /* ---------- filtro de tipos (seleção cumulativa) ---------- */
  let tiposFiltroAtuais = "";
  function montarFiltro(tiposPresentes) {
    const tipos = [...TIPOS_ORDEM.filter(t => tiposPresentes.includes(t)), ...tiposPresentes.filter(t => !TIPOS_ORDEM.includes(t)).sort()];
    if (filtroTipos) { for (const t of [...filtroTipos]) if (!tipos.includes(t)) filtroTipos.delete(t); if (!filtroTipos.size || filtroTipos.size === tipos.length) filtroTipos = null; }
    $("filtroResumo").textContent = filtroTipos ? [...filtroTipos].join(", ") : "Todos";
    const chave = tipos.join("|") + "#" + (filtroTipos ? [...filtroTipos].sort().join("|") : "*");
    if (chave === tiposFiltroAtuais) return;
    tiposFiltroAtuais = chave;
    const menu = $("filtroMenu"); menu.textContent = "";
    const todos = el("input", { type: "checkbox", id: "ft-todos" }); todos.checked = !filtroTipos;
    todos.addEventListener("change", () => { filtroTipos = null; render(); });
    menu.append(el("label", { for: "ft-todos" }, todos, el("b", { text: "Todos" })), el("hr"));
    for (const t of tipos) {
      const cb = el("input", { type: "checkbox", id: "ft-" + t }); cb.checked = !!(filtroTipos && filtroTipos.has(t));
      cb.addEventListener("change", () => {
        if (!filtroTipos) filtroTipos = new Set();
        if (cb.checked) filtroTipos.add(t); else filtroTipos.delete(t);
        if (!filtroTipos.size || filtroTipos.size === tipos.length) filtroTipos = null; // nada ou tudo marcado = Todos
        render();
      });
      const dot = el("i"); dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:3px;background:${corTipo(t)}`;
      menu.append(el("label", { for: "ft-" + t }, cb, dot, t));
    }
  }
  $("filtroBtn").addEventListener("click", (ev) => {
    ev.stopPropagation();
    const m = $("filtroMenu"); m.hidden = !m.hidden; $("filtroBtn").setAttribute("aria-expanded", String(!m.hidden));
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest("#filtroTipos")) { $("filtroMenu").hidden = true; $("filtroBtn").setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { $("filtroMenu").hidden = true; $("filtroBtn").setAttribute("aria-expanded", "false"); } });

  /* ---------- ordenação pelas colunas ---------- */
  for (const th of document.querySelectorAll("th[data-sort]")) {
    th.querySelector("button").addEventListener("click", () => {
      const chave = th.dataset.sort;
      // 1º clique: crescente; 2º: decrescente; 3º: volta à ordem original
      if (!ordem || ordem.chave !== chave) ordem = { chave, dir: 1 };
      else if (ordem.dir === 1) ordem = { chave, dir: -1 };
      else ordem = null;
      gravar("fiis.ordem", ordem); render();
    });
  }

  function botaoRemover(id) {
    const box = el("span", { class: "confirm" });
    const b = el("button", { class: "iconbtn danger", type: "button", text: "Remover", "aria-label": "Remover " + id });
    b.addEventListener("click", () => {
      box.textContent = "";
      box.append(el("span", { class: "muted", text: "Remover?" }),
        el("button", { class: "iconbtn danger", type: "button", text: "Sim", onclick: () => { carteira = carteira.filter(f => f.id !== id); salvarCarteira(); render(); } }),
        el("button", { class: "iconbtn", type: "button", text: "Não", onclick: () => { box.textContent = ""; box.append(botaoRemover(id)); } }));
    });
    box.append(b); return box;
  }

  /* ---------- rolagem horizontal no topo da tabela e linha destacada ---------- */
  function ajustarRolagemTopo() {
    const box = $("tableBox"), top = $("topScroll");
    $("topScrollInner").style.width = box.scrollWidth + "px";
    top.hidden = box.scrollWidth <= box.clientWidth + 1;
  }
  $("topScroll").addEventListener("scroll", () => { const b = $("tableBox"), t = $("topScroll"); if (Math.abs(b.scrollLeft - t.scrollLeft) > 1) b.scrollLeft = t.scrollLeft; });
  $("tableBox").addEventListener("scroll", () => { const b = $("tableBox"), t = $("topScroll"); if (Math.abs(b.scrollLeft - t.scrollLeft) > 1) t.scrollLeft = b.scrollLeft; });
  window.addEventListener("resize", ajustarRolagemTopo);
  $("tbody").addEventListener("click", (ev) => {
    if (ev.target.closest("input, button, a, select")) return;
    const tr = ev.target.closest("tr[data-id]"); if (!tr) return;
    linhaSel = linhaSel === tr.dataset.id ? null : tr.dataset.id;
    for (const x of $("tbody").querySelectorAll("tr[data-id]")) x.classList.toggle("sel", x.dataset.id === linhaSel);
  });

  /* ---------- barra de carregamento e aviso ---------- */
  let barraTimer = null, toastTimer = null;
  function barraInicio(duracaoEstimadaMs) {
    const bar = $("loadbar"), fill = $("loadbarFill"), t0 = Date.now();
    bar.hidden = false; fill.style.width = "3%";
    clearInterval(barraTimer);
    barraTimer = setInterval(() => {
      const p = Math.min(95, 3 + 92 * (1 - Math.exp(-(Date.now() - t0) / duracaoEstimadaMs)));
      fill.style.width = p.toFixed(1) + "%"; bar.setAttribute("aria-valuenow", Math.round(p));
    }, 500);
  }
  function barraFim() {
    clearInterval(barraTimer); barraTimer = null;
    $("loadbarFill").style.width = "100%";
    setTimeout(() => { $("loadbar").hidden = true; $("loadbarFill").style.width = "0"; }, 700);
  }
  function mostrarAviso(texto, erro) {
    const t = $("toast"); t.textContent = texto; t.classList.toggle("erro", !!erro); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
  }
  $("toast").addEventListener("click", () => { $("toast").hidden = true; });

  /* ---------- dados de mercado ---------- */
  async function carregarMercado(dadosProntos) {
    setStatus("Carregando dados de mercado…");
    const aviso = $("avisoDados");
    try {
      let j = dadosProntos && typeof dadosProntos === "object" && dadosProntos.fiis ? dadosProntos : null;
      if (!j) {
        const r = await fetch("dados/mercado.json?t=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        j = await r.json();
      }
      mercado = { fiis: j.fiis || {}, ranking: j.ranking || [], erros: j.erros || {}, atualizadoEm: j.atualizadoEm, rankingAtualizadoEm: j.rankingAtualizadoEm };
      if (!j.atualizadoEm) {
        aviso.hidden = false;
        aviso.textContent = "Os dados de mercado ainda não foram baixados. Clique em \"Atualizar dados agora\" (precisa do token do GitHub em Configurações) ou, no GitHub, abra a aba Actions e clique em \"Run workflow\". Até lá, a tabela usa os valores da planilha.";
        setStatus("Usando os valores da planilha.");
      } else {
        aviso.hidden = true;
        const falhas = Object.keys(mercado.erros).filter(k => k !== "_ranking" && carteira.some(f => f.id === k));
        setStatus("Dados de mercado de " + fmtData(j.atualizadoEm) + (falhas.length ? ` · ${falhas.length} FII(s) não atualizados: ${falhas.join(", ")}` : ""));
      }
    } catch (e) {
      aviso.hidden = false;
      aviso.textContent = location.protocol === "file:"
        ? "Aberto direto do computador, o navegador bloqueia a leitura de dados/mercado.json. Publique no GitHub Pages (veja o README) ou rode um servidor local: python -m http.server"
        : "Não foi possível ler dados/mercado.json. A tabela usa os últimos valores conhecidos.";
      setStatus("Sem dados de mercado novos.");
    }
    render();
  }

  /* ---------- análise de um FII ---------- */
  function promptFii(f, base) {
    const c = calc(f, cfg), x = f.extra || {};
    return `Você é um consultor especialista em fundos imobiliários (FIIs e Fiagros) brasileiros, com anos de experiência analisando relatórios gerenciais, carteiras de imóveis e de recebíveis, qualidade de crédito (CRIs, indexadores, LTV, garantias), contratos de locação (típicos e atípicos, vencimentos, revisionais), vacância física e financeira, gestão e governança. Hoje é ${new Date().toLocaleDateString("pt-BR")}. Atenda seu cliente, um investidor pessoa física focado em renda que já tem cotas do ${f.id} e quer saber se compra mais, mantém ou vende. Escreva em português do Brasil, falando diretamente com o cliente (use "você"), com a segurança e a clareza de um consultor: explique o porquê de cada ponto, diga o que acompanhar daqui para frente e dê uma recomendação clara.

DADOS DA CARTEIRA: tipo ${f.tipo}; ${c.C} cotas; cotação R$ ${N2.format(c.D)}; último dividendo R$ ${N3.format(c.E)}; DY 12m ${Number.isFinite(x.dy12m) ? N2.format(x.dy12m) + "%" : "?"}; P/VP ${Number.isFinite(x.pvp) ? N2.format(x.pvp) : "?"}; liquidez diária ${Number.isFinite(x.liquidez) ? BRL.format(x.liquidez) : "?"}; vacância ${Number.isFinite(x.vacancia) ? N2.format(x.vacancia) + "%" : "?"}; segmento ${x.segmento || "?"}; número mágico ${N0.format(c.J)} cotas; meta ${c.L} cotas em ${c.Q} ano(s), faltam ${c.M}. Dados de ${f.atualizadoEm ? fmtData(f.atualizadoEm) : "uma planilha (podem estar desatualizados)"}.

ANÁLISE AUTOMÁTICA POR REGRAS (ponto de partida; como especialista, você pode discordar): veredito ${base.veredito}.

Pesquise na internet dados recentes deste fundo: dividendos dos últimos meses, P/VP, notícias, fatos relevantes e o último relatório gerencial. Não invente números: se não encontrar um dado, diga.

Formato (markdown simples, sem tabelas, até ~350 palavras):
## Resumo
## Indicadores
## Pontos positivos
## Riscos
## Veredito
Primeira linha exatamente "Veredito: COMPRAR", "Veredito: MANTER" ou "Veredito: VENDER", depois 1–2 frases com o motivo e uma sugestão prática considerando o número mágico e a meta.
Termine com "Fontes: ..." listando os sites consultados.`;
  }

  function abrirAnalise(id) {
    const painel = $("analisePanel"); painel.hidden = false;
    $("analiseTitulo").textContent = "Análise de " + id;
    const a = analises[id];
    if (a && a.texto) {
      renderMd($("analiseTexto"), a.texto);
      const st = $("analiseStatus"); st.textContent = "";
      st.append(`Gerada em ${fmtData(a.em)} (${a.modo === "ia" ? "Claude" : "regras"}) `, el("button", { class: "iconbtn", type: "button", text: "Refazer", disabled: ocupado, onclick: () => gerarAnalise(id) }));
    } else gerarAnalise(id);
    painel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function gerarAnalise(id) {
    const f = fiisAtuais().find(x => x.id === id); if (!f || ocupado) return;
    const out = $("analiseTexto"), st = $("analiseStatus");
    const base = window.Regras.analisar(f, cfg, mercado.ranking);
    if (!window.IA.temChave()) {
      renderMd(out, base.texto);
      analises[id] = { texto: base.texto, veredito: base.veredito, em: new Date().toISOString(), modo: "regras" };
      gravar("fiis.analises", analises); st.textContent = "Análise por regras. Para usar o Claude com pesquisa na internet, configure a chave da API."; render(); return;
    }
    ocupado = true; ctl = new AbortController(); render();
    out.textContent = ""; out.append(el("p", { class: "thinking pulse", text: "Pesquisando e escrevendo…" }));
    try {
      const r = await window.IA.perguntar(promptFii(f, base), { signal: ctl.signal, onStatus: (t) => { st.textContent = t; }, maxBuscas: 4 });
      renderMd(out, r.texto);
      const m = r.texto.match(/Veredito:\s*\**\s*(COMPRAR|MANTER|VENDER)/i);
      analises[id] = { texto: r.texto, veredito: m ? m[1].toUpperCase() : base.veredito, em: new Date().toISOString(), modo: "ia" };
      gravar("fiis.analises", analises);
      st.textContent = "Gerada agora pelo Claude" + (r.cortado ? " (texto cortado)" : "");
    } catch (e) {
      renderMd(out, base.texto);
      st.textContent = window.IA.explicarErro(e) + " Mostrando a análise por regras.";
    } finally { ocupado = false; ctl = null; render(); }
  }

  /* ---------- relatório geral ---------- */
  function mostrarRelatorio() {
    if (relatorio && relatorio.texto) { renderMd($("relTexto"), relatorio.texto); $("relStatus").textContent = `Gerado em ${fmtData(relatorio.em)} (${relatorio.modo === "ia" ? "Claude" : "regras"})`; }
  }

  async function gerarRelatorio() {
    if (ocupado) return;
    const fiis = fiisAtuais();
    const out = $("relTexto"), st = $("relStatus");
    $("relPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    const base = window.Regras.relatorio(fiis, cfg, mercado.ranking);
    // vereditos por regras também ficam na tabela, sem apagar análises feitas pelo Claude
    for (const { f, a } of base.analises) if (!analises[f.id] || analises[f.id].modo !== "ia") analises[f.id] = { texto: a.texto, veredito: a.veredito, em: new Date().toISOString(), modo: "regras" };
    gravar("fiis.analises", analises);
    if (!window.IA.temChave()) {
      relatorio = { texto: base.texto, em: new Date().toISOString(), modo: "regras" };
      gravar("fiis.relatorio", relatorio); mostrarRelatorio(); render(); return;
    }
    ocupado = true; ctl = new AbortController(); render();
    out.textContent = ""; out.append(el("p", { class: "thinking pulse", text: "Pesquisando vários sites. Pode levar alguns minutos…" }));
    const sug = window.Regras.sugestoes(fiis, mercado.ranking, 12);
    const prompt = `Você é um consultor especialista em fundos imobiliários (FIIs e Fiagros) brasileiros, com anos de experiência montando e acompanhando carteiras de renda: avalia relatórios gerenciais, qualidade de crédito dos CRIs, contratos de locação, vacância, gestão, diversificação por tipo, segmento e gestora, e o momento de juros. Hoje é ${new Date().toLocaleDateString("pt-BR")}. Prepare para seu cliente, um investidor pessoa física focado em renda mensal, um relatório de consultoria sobre a carteira abaixo. Escreva em português do Brasil, falando diretamente com o cliente (use "você"), com recomendações claras e justificadas, como faria em uma reunião de acompanhamento.

RELATÓRIO AUTOMÁTICO POR REGRAS (dados de mercado e vereditos iniciais; revise com o que encontrar):
${base.texto}

CANDIDATOS A FIIs NOVOS PELO RANKING DO FUNDAMENTUS (liquidez alta, P/VP entre 0,80 e 1,02):
${sug.map(r => `${r.ticker} (${r.segmento}): cotação ${N2.format(r.cotacao)}, P/VP ${N2.format(r.pvp)}, DY ${N2.format(r.dy12m)}%, liquidez ${N0.format(r.liquidez)}`).join("\n") || "nenhum disponível"}

Metas: ${cfg.meta} cotas de cada FII em ${cfg.anos} ano(s).
Pesquise na internet para confirmar os pontos mais importantes (principalmente os fundos marcados como VENDER e os candidatos novos). Não invente números.

Formato (markdown simples, sem tabelas):
## Visão geral
## Indicações para os FIIs que você tem
Uma linha por fundo: "- **TICKER** — COMPRAR | MANTER | VENDER — motivo curto". Agrupe: COMPRAR, depois MANTER, depois VENDER.
## Sugestões de FIIs novos
3 a 5 fundos que melhorem a diversificação, com tipo, P/VP, DY e motivo.
## Próximos passos
3 ações práticas para o próximo aporte.
Termine com "Fontes: ...".`;
    try {
      const r = await window.IA.perguntar(prompt, { signal: ctl.signal, onStatus: (t) => { st.textContent = t; }, maxBuscas: 8 });
      relatorio = { texto: r.texto, em: new Date().toISOString(), modo: "ia" };
      gravar("fiis.relatorio", relatorio); mostrarRelatorio();
      for (const m of r.texto.matchAll(/\*\*([A-Z]{4}1[1-3])\*\*\s*[—-]+\s*(COMPRAR|MANTER|VENDER)/g)) {
        if (analises[m[1]] && analises[m[1]].modo !== "ia") analises[m[1]].veredito = m[2];
      }
      gravar("fiis.analises", analises);
      if (r.cortado) st.textContent += " (texto cortado)";
    } catch (e) {
      relatorio = { texto: base.texto, em: new Date().toISOString(), modo: "regras" };
      gravar("fiis.relatorio", relatorio); mostrarRelatorio();
      st.textContent = window.IA.explicarErro(e) + " Mostrando o relatório por regras.";
    } finally { ocupado = false; ctl = null; render(); }
  }

  /* ---------- eventos ---------- */
  $("hoje").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("meta").value = cfg.meta; $("anos").value = cfg.anos;
  const salvarCfg = () => { cfg = { meta: Math.max(1, Math.round(+$("meta").value || 100)), anos: Math.max(1, Math.round(+$("anos").value || 1)) }; gravar("fiis.cfg", cfg); render(); };
  $("meta").addEventListener("change", salvarCfg);
  $("anos").addEventListener("change", salvarCfg);
  $("btnRelatorio").addEventListener("click", gerarRelatorio);
  $("btnRecarregar").addEventListener("click", () => carregarMercado());

  /* ---------- atualizar agora pelo GitHub Actions ---------- */
  async function atualizarAgora() {
    if (ocupado) return;
    const aviso = $("avisoDados");
    if (!window.GH.temToken()) {
      $("config").open = true; $("ghToken").focus();
      aviso.hidden = false;
      aviso.textContent = "Para atualizar pelo botão, cole o token do GitHub em Configurações (o passo a passo está no README do repositório).";
      return;
    }
    ocupado = true; ctl = new AbortController(); render();
    barraInicio(150000);
    let sucesso = false;
    try {
      const r = await window.GH.atualizarAgora({ signal: ctl.signal, onStatus: setStatus });
      if (r.conclusao === "success") {
        setStatus("Atualização concluída. Carregando os dados novos…");
        let j = null;
        try { j = await window.GH.lerMercado(ctl.signal); } catch { /* usa o arquivo do site */ }
        ocupado = false; ctl = null;
        await carregarMercado(j);
        sucesso = true;
        mostrarAviso("Dados atualizados com sucesso às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ".");
      } else {
        aviso.hidden = false; aviso.textContent = "";
        aviso.append(r.conclusao === "timeout" ? "A atualização está demorando mais que o normal. " : "A atualização falhou no GitHub. ",
          r.url ? el("a", { href: r.url, target: "_blank", rel: "noopener", text: "Ver o registro da execução" }) : "", ".");
        setStatus("Os dados não foram atualizados.");
      }
    } catch (e) {
      setStatus(e && e.name === "AbortError" ? "Acompanhamento interrompido. A atualização continua rodando no GitHub; clique em Recarregar dados daqui a alguns minutos." : window.GH.explicarErro(e));
    } finally {
      ocupado = false; ctl = null; barraFim(); render();
      if (!sucesso) mostrarAviso("A atualização não terminou. Veja a mensagem no topo da página.", true);
    }
  }
  $("btnAtualizarAgora").addEventListener("click", atualizarAgora);

  const gh = window.GH.config();
  $("ghToken").value = gh.token; $("ghDono").value = gh.dono; $("ghRepo").value = gh.repo;
  $("btnSalvarGH").addEventListener("click", () => {
    const token = $("ghToken").value.trim(), dono = $("ghDono").value.trim(), repo = $("ghRepo").value.trim();
    if (token && !/^(github_pat_|ghp_)/.test(token)) { $("ghStatus").textContent = "O token do GitHub começa com github_pat_ (ou ghp_)."; return; }
    gravar("fiis.github", { token, dono, repo });
    $("ghStatus").textContent = token ? "Salvo. Agora é só clicar em \"Atualizar dados agora\"." : "Salvo sem token.";
  });
  $("btnApagarGH").addEventListener("click", () => { const c = window.GH.config(); gravar("fiis.github", { dono: c.dono, repo: c.repo }); $("ghToken").value = ""; $("ghStatus").textContent = "Token apagado deste navegador."; });
  $("btnParar").addEventListener("click", () => ctl && ctl.abort());

  $("addForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = $("novoTicker").value.trim().toUpperCase();
    if (!/^[A-Z]{4}1[1-3]$/.test(t)) { $("addStatus").textContent = "Use o código do fundo, por exemplo HGLG11."; return; }
    if (carteira.some(f => f.id === t)) { $("addStatus").textContent = t + " já está na carteira."; return; }
    const r = (mercado.ranking || []).find(x => x.ticker === t);
    carteira.push({ id: t, tipo: $("novoTipo").value, qtd: Math.max(0, Math.round(+$("novaQtd").value || 0)), cotacao: r ? r.cotacao : 0, dividendo: r && r.dy12m && r.cotacao ? +(r.dy12m * r.cotacao / 1200).toFixed(3) : 0 });
    salvarCarteira(); render();
    $("addStatus").textContent = t + " adicionado.";
    const d = $("addDica"); d.hidden = false;
    d.textContent = "Para a cotação de " + t + " ser atualizada todo dia, copie a lista em Configurações e cole no arquivo dados/tickers.json do seu repositório.";
    $("novoTicker").value = ""; $("novaQtd").value = "0";
  });

  const ia = window.IA.config();
  $("apiKey").value = ia.chave || ""; $("modelo").value = ia.modelo || "claude-opus-5-5";
  $("btnSalvarIA").addEventListener("click", () => {
    const chave = $("apiKey").value.trim();
    if (chave && !/^sk-ant-/.test(chave)) { $("iaStatus").textContent = "A chave da Anthropic começa com sk-ant-."; return; }
    gravar("fiis.ia", { chave, modelo: $("modelo").value });
    $("iaStatus").textContent = chave ? "Salvo. As próximas análises vão usar o Claude." : "Salvo sem chave: as análises usam regras.";
  });
  $("btnApagarIA").addEventListener("click", () => { apagar("fiis.ia"); $("apiKey").value = ""; $("iaStatus").textContent = "Chave apagada deste navegador."; });

  $("btnCopiarTickers").addEventListener("click", async () => {
    const txt = $("tickersJson").value;
    try { await navigator.clipboard.writeText(txt); $("copiarStatus").textContent = "Copiado."; }
    catch { $("tickersJson").select(); $("copiarStatus").textContent = "Selecionado. Use Ctrl+C para copiar."; }
  });

  $("btnExportar").addEventListener("click", () => {
    const dados = { versao: 1, exportadoEm: new Date().toISOString(), carteira, cfg, analises, relatorio };
    const blob = new Blob([JSON.stringify(dados, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "carteira-fiis-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $("backupStatus").textContent = "Backup baixado.";
  });
  $("arqImportar").addEventListener("change", async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
    try {
      const j = JSON.parse(await arq.text());
      if (!Array.isArray(j.carteira)) throw new Error("arquivo sem carteira");
      carteira = j.carteira.filter(f => f && /^[A-Z]{4}1[1-3]$/.test(f.id)).map(f => ({ id: f.id, tipo: String(f.tipo || "OUTRO"), qtd: Math.max(0, +f.qtd || 0), cotacao: +f.cotacao || 0, dividendo: +f.dividendo || 0 }));
      if (j.cfg) cfg = { meta: +j.cfg.meta || 100, anos: +j.cfg.anos || 1 };
      analises = j.analises && typeof j.analises === "object" ? j.analises : {};
      relatorio = j.relatorio || null;
      salvarCarteira(); gravar("fiis.cfg", cfg); gravar("fiis.analises", analises); gravar("fiis.relatorio", relatorio);
      $("meta").value = cfg.meta; $("anos").value = cfg.anos; mostrarRelatorio(); render();
      $("backupStatus").textContent = `Backup restaurado: ${carteira.length} FIIs.`;
    } catch (e) { $("backupStatus").textContent = "Arquivo inválido: " + e.message; }
    ev.target.value = "";
  });
  function botaoReset() {
    const box = $("resetBox"); box.textContent = "";
    box.append(el("button", { type: "button", class: "danger", text: "Voltar à carteira original", onclick: () => {
      box.textContent = "";
      box.append(el("span", { class: "muted", text: "Apagar suas alterações e voltar aos 20 FIIs da planilha?" }),
        el("button", { type: "button", class: "iconbtn danger", text: "Sim", onclick: () => { carteira = CARTEIRA_INICIAL.map(f => ({ ...f })); salvarCarteira(); render(); botaoReset(); $("backupStatus").textContent = "Carteira original restaurada."; } }),
        el("button", { type: "button", class: "iconbtn", text: "Não", onclick: botaoReset }));
    } }));
  }
  botaoReset();

  mostrarRelatorio();
  render();
  carregarMercado();
})();
