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

  function numTd(v, fmt, cls) { return el("td", { class: "num " + (cls || ""), text: Number.isFinite(v) ? fmt.format(v) : "–" }); }

  function render() {
    const fiis = fiisAtuais();
    const tb = $("tbody"); tb.textContent = "";
    if (!fiis.length) tb.append(el("tr", {}, el("td", { class: "empty", colspan: "22", text: "Nenhum FII na carteira. Adicione o primeiro no formulário abaixo." })));
    const tot = { C: 0, F: 0, Gs: 0, Gn: 0, I: 0, J: 0, M: 0, N: 0, O: 0, P: 0, R: 0, L: 0 };
    const porTipo = {};
    for (const f of fiis) {
      const c = calc(f, cfg);
      tot.C += c.C; tot.F += c.F; if (c.D) { tot.Gs += c.G; tot.Gn++; } tot.I += c.I; tot.J += c.J; tot.M += c.M; tot.N += c.N; tot.O += c.O; tot.P += c.P; tot.R += c.R; tot.L += c.L;
      const t = f.tipo || "OUTRO"; porTipo[t] = porTipo[t] || { n: 0, v: 0 }; porTipo[t].n++; porTipo[t].v += c.I;

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
      const pvp = Number.isFinite(f.extra.pvp) ? f.extra.pvp : NaN;
      const an = el("td", { class: "l" });
      const a = analises[f.id];
      if (a && a.veredito) an.append(el("span", { class: "chip v-" + a.veredito, text: a.veredito }), " ");
      an.append(el("button", { class: "iconbtn", type: "button", text: a ? "Ver / refazer" : "Analisar", disabled: ocupado, onclick: () => abrirAnalise(f.id) }));

      tb.append(el("tr", {},
        tk, el("td", { class: "l" }, chip), el("td", {}, qty),
        numTd(c.D, BRL), numTd(c.E, N3), numTd(c.F, BRL), numTd(c.G, PCT), numTd(c.H, PCT),
        numTd(pvp, N2, Number.isFinite(pvp) ? (pvp < 0.95 ? "pos" : pvp > 1.05 ? "neg" : "") : ""),
        numTd(c.I, BRL), numTd(c.J, N0), numTd(c.K, N0, c.K <= 0 ? "pos" : ""), numTd(c.L, N0), numTd(c.M, N0, c.M <= 0 ? "pos" : ""),
        numTd(c.N, BRL), numTd(c.O, BRL), numTd(c.P, BRL), numTd(c.Q, N0), numTd(c.R, BRL), numTd(c.S, BRL),
        an, el("td", {}, botaoRemover(f.id))));
    }
    const Gavg = tot.Gn ? tot.Gs / tot.Gn : 0;
    const tf = $("tfoot"); tf.textContent = "";
    if (fiis.length) tf.append(el("tr", {}, el("td", { class: "tk", text: "Total" }), el("td", { class: "l", text: fiis.length + " FIIs" }),
      numTd(tot.C, N0), el("td"), el("td"), numTd(tot.F, BRL), numTd(Gavg, PCT), numTd(Gavg * 12, PCT), el("td"), numTd(tot.I, BRL),
      numTd(tot.J, N0), numTd(tot.J - tot.C, N0), numTd(tot.L, N0), numTd(tot.M, N0), numTd(tot.N, BRL), numTd(tot.O, BRL), numTd(tot.P, BRL),
      numTd(Math.max(1, +cfg.anos || 1), N0), numTd(tot.R, BRL), numTd(tot.R - tot.F, BRL), el("td"), el("td")));

    const k = $("kpis"); k.textContent = "";
    const kpi = (r, v, s) => k.append(el("div", { class: "kpi" }, el("span", { class: "eyebrow", text: r }), el("span", { class: "v", text: v }), el("span", { class: "s", text: s })));
    kpi("Patrimônio atual", BRL.format(tot.I), N0.format(tot.C) + " cotas em " + fiis.length + " FIIs");
    kpi("Dividendos por mês", BRL.format(tot.F), BRL.format(tot.F * 12) + " por ano");
    kpi("DY médio", PCT.format(Gavg) + " a.m.", PCT.format(Gavg * 12) + " ao ano");
    kpi("Falta para a meta", BRL.format(tot.N), N0.format(tot.M) + " cotas no total");
    kpi("Investir por mês", BRL.format(tot.R), BRL.format(Math.max(0, tot.R - tot.F)) + " reinvestindo os dividendos");

    const bar = $("allocBar"), lg = $("allocLegend"); bar.textContent = ""; lg.textContent = "";
    for (const t of Object.keys(porTipo).sort((a, b) => porTipo[b].v - porTipo[a].v)) {
      const p = tot.I ? porTipo[t].v / tot.I : 0;
      const s = el("span", { title: t + " " + PCT.format(p) }); s.style.width = (p * 100) + "%"; s.style.background = corTipo(t); bar.append(s);
      const i = el("i"); i.style.background = corTipo(t);
      lg.append(el("span", {}, i, `${t}: ${porTipo[t].n} FII${porTipo[t].n > 1 ? "s" : ""} · ${PCT.format(p)}`));
    }
    $("btnRelatorio").disabled = ocupado || !fiis.length;
    $("btnRecarregar").disabled = ocupado;
    $("btnParar").hidden = !ocupado;
    $("tickersJson").value = JSON.stringify(carteira.map(f => ({ ticker: f.id, tipo: f.tipo })), null, 1);
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

  /* ---------- dados de mercado ---------- */
  async function carregarMercado() {
    setStatus("Carregando dados de mercado…");
    const aviso = $("avisoDados");
    try {
      const r = await fetch("dados/mercado.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      mercado = { fiis: j.fiis || {}, ranking: j.ranking || [], erros: j.erros || {}, atualizadoEm: j.atualizadoEm, rankingAtualizadoEm: j.rankingAtualizadoEm };
      if (!j.atualizadoEm) {
        aviso.hidden = false;
        aviso.textContent = "Os dados de mercado ainda não foram baixados. No GitHub, abra a aba Actions, escolha \"Atualizar dados dos FIIs\" e clique em \"Run workflow\". Até lá, a tabela usa os valores da planilha.";
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
    return `Você é um analista de fundos imobiliários (FIIs e Fiagros) brasileiros. Hoje é ${new Date().toLocaleDateString("pt-BR")}. Escreva em português do Brasil uma análise objetiva do ${f.id} para um investidor pessoa física focado em renda, que já tem cotas e quer saber se compra mais, mantém ou vende.

DADOS DA CARTEIRA: tipo ${f.tipo}; ${c.C} cotas; cotação R$ ${N2.format(c.D)}; último dividendo R$ ${N3.format(c.E)}; DY 12m ${Number.isFinite(x.dy12m) ? N2.format(x.dy12m) + "%" : "?"}; P/VP ${Number.isFinite(x.pvp) ? N2.format(x.pvp) : "?"}; liquidez diária ${Number.isFinite(x.liquidez) ? BRL.format(x.liquidez) : "?"}; vacância ${Number.isFinite(x.vacancia) ? N2.format(x.vacancia) + "%" : "?"}; segmento ${x.segmento || "?"}; número mágico ${N0.format(c.J)} cotas; meta ${c.L} cotas em ${c.Q} ano(s), faltam ${c.M}. Dados de ${f.atualizadoEm ? fmtData(f.atualizadoEm) : "uma planilha (podem estar desatualizados)"}.

ANÁLISE AUTOMÁTICA POR REGRAS (ponto de partida, pode discordar): veredito ${base.veredito}.

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
    const prompt = `Você é um analista de fundos imobiliários (FIIs e Fiagros) brasileiros. Hoje é ${new Date().toLocaleDateString("pt-BR")}. Escreva em português do Brasil um relatório geral da carteira abaixo, para um investidor pessoa física focado em renda mensal.

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
  $("btnRecarregar").addEventListener("click", carregarMercado);
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
