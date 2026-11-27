/* Análise por regras (funciona sem chave de API): P/VP, dividend yield, liquidez e vacância. */
(function () {
  "use strict";
  const { BRL, N2, N0, PCT } = window.U;

  const DY_REF = { PAPEL: 12.5, TIJOLO: 9.5, FOF: 11, FIAGRO: 14, ENERGIA: 13, "HÍBRIDO": 10 };
  const ehPapelSeg = (s) => /t[íi]tulos|receb[íi]veis|papel/i.test(s || "");

  function mediana(a) { const v = a.filter(Number.isFinite).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }

  /* Referências de DY tiradas do ranking do dia, quando existe; senão, valores fixos. */
  function referencias(ranking) {
    const ref = { ...DY_REF };
    const bons = (ranking || []).filter(r => r.liquidez >= 500000 && r.dy12m > 0 && r.dy12m < 30);
    const papel = mediana(bons.filter(r => ehPapelSeg(r.segmento)).map(r => r.dy12m));
    const tijolo = mediana(bons.filter(r => !ehPapelSeg(r.segmento)).map(r => r.dy12m));
    if (papel) ref.PAPEL = papel;
    if (tijolo) { ref.TIJOLO = tijolo; ref["HÍBRIDO"] = tijolo; }
    return ref;
  }

  function dyAnual(f) {
    const x = f.extra || {};
    if (Number.isFinite(x.dy12m) && x.dy12m > 0) return { v: x.dy12m, fonte: "últimos 12 meses" };
    if (f.cotacao > 0 && f.dividendo > 0) return { v: f.dividendo * 12 / f.cotacao * 100, fonte: "último dividendo × 12" };
    return null;
  }

  function analisar(f, cfg, ranking) {
    const ref = referencias(ranking);
    const x = f.extra || {};
    const bench = ref[f.tipo] || 11;
    const dy = dyAnual(f);
    const pvp = Number.isFinite(x.pvp) ? x.pvp : null;
    let score = 0;
    const pos = [], neg = [], info = [];

    if (pvp !== null) {
      if (pvp < 0.85) {
        if (dy && dy.v > bench * 1.3) { score += 1; neg.push(`P/VP muito baixo (${N2.format(pvp)}) junto com dividendos bem acima da média: o mercado pode estar vendo risco de crédito ou de corte de dividendos. Vale ler o último relatório gerencial.`); }
        else { score += 2; pos.push(`Cota negociada com desconto forte: P/VP de ${N2.format(pvp)} (paga ${N0.format((1 - pvp) * 100)}% a menos que o valor patrimonial).`); }
      } else if (pvp < 0.97) { score += 1; pos.push(`Cota abaixo do valor patrimonial (P/VP ${N2.format(pvp)}).`); }
      else if (pvp <= 1.05) { info.push(`Preço próximo do valor patrimonial (P/VP ${N2.format(pvp)}).`); }
      else if (pvp <= 1.15) { score -= 1; neg.push(`Cota acima do valor patrimonial (P/VP ${N2.format(pvp)}): está pagando ágio.`); }
      else { score -= 2; neg.push(`Ágio alto: P/VP de ${N2.format(pvp)}.`); }
    } else info.push("P/VP não disponível.");

    if (dy) {
      const d = dy.v - bench;
      const t = `Dividend yield de ${N2.format(dy.v)}% ao ano (${dy.fonte}); a referência para ${f.tipo} é cerca de ${N2.format(bench)}%.`;
      if (d >= 1.5) { score += 1; pos.push(t); }
      else if (d <= -4) { score -= 2; neg.push(t); }
      else if (d <= -2) { score -= 1; neg.push(t); }
      else info.push(t);
    } else info.push("Dividend yield não disponível.");

    if (Number.isFinite(x.liquidez)) {
      if (x.liquidez < 300000) { score -= 1; neg.push(`Liquidez baixa (${BRL.format(x.liquidez)} por dia): pode ser difícil vender sem derrubar o preço.`); }
      else if (x.liquidez >= 2000000) pos.push(`Boa liquidez (${BRL.format(x.liquidez)} por dia).`);
    }
    if (Number.isFinite(x.vacancia) && f.tipo === "TIJOLO") {
      if (x.vacancia > 15) { score -= 1; neg.push(`Vacância alta: ${N2.format(x.vacancia)}%.`); }
      else if (x.vacancia <= 5) pos.push(`Vacância baixa: ${N2.format(x.vacancia)}%.`);
    }

    const semDados = pvp === null && !dy;
    const veredito = semDados ? "MANTER" : score >= 2 ? "COMPRAR" : score <= -2 ? "VENDER" : "MANTER";
    const c = window.U.calc(f, cfg);
    const motivo = semDados ? "Ainda faltam dados de mercado para eu fazer uma avaliação segura. Rode a atualização automática e volte a analisar." :
      veredito === "COMPRAR" ? "Na minha leitura, o preço e a renda estão atrativos em relação a fundos parecidos, o que justifica reforçar a posição com aportes graduais." :
      veredito === "VENDER" ? "Os indicadores estão piores que os de fundos parecidos. Minha recomendação é reduzir a posição ou trocar por um fundo mais barato ou mais sólido, depois de conferir o último relatório gerencial." :
      "Os indicadores estão dentro do normal para o tipo do fundo. Recomendo manter e seguir acompanhando os relatórios mensais.";
    const passo = c.M > 0
      ? `Faltam ${N0.format(c.M)} cotas para a meta de ${N0.format(c.L)} (cerca de ${BRL.format(c.N)}), ou ${BRL.format(c.R)} por mês no prazo de ${c.Q} ano(s).`
      : `Você já atingiu a meta de ${N0.format(c.L)} cotas.`;

    const linhas = [
      "## Resumo",
      `Como consultor, minha leitura do ${f.id}: é um fundo do tipo ${f.tipo}${x.segmento ? ` (segmento: ${x.segmento})` : ""}. Você tem ${N0.format(c.C)} cotas, ${BRL.format(c.I)} na carteira, que rendem cerca de ${BRL.format(c.F)} por mês.`,
      info.length ? "## Indicadores" : null,
      ...info.map(s => "- " + s),
      pos.length ? "## Pontos positivos" : null, ...pos.map(s => "- " + s),
      neg.length ? "## Riscos e pontos de atenção" : null, ...neg.map(s => "- " + s),
      "## Veredito",
      `Veredito: ${veredito}`,
      `${motivo} ${passo} Número mágico: ${N0.format(c.J)} cotas.`,
      "",
      `Fontes: ${x.fonte || "valores da planilha"}${f.atualizadoEm ? " (dados de " + window.U.fmtData(f.atualizadoEm) + ")" : ""}. Análise automática por regras, no papel de consultor especialista em FIIs; para uma análise com notícias e relatórios gerenciais, configure a chave da API.`
    ].filter(l => l !== null);
    return { veredito, score, texto: linhas.join("\n") };
  }

  function sugestoes(fiis, ranking, qtd = 5) {
    const tenho = new Set(fiis.map(f => f.id));
    const ref = referencias(ranking);
    const valorTijolo = fiis.filter(f => f.tipo === "TIJOLO").reduce((s, f) => s + (f.qtd || 0) * (f.cotacao || 0), 0);
    const total = fiis.reduce((s, f) => s + (f.qtd || 0) * (f.cotacao || 0), 0) || 1;
    const poucoTijolo = valorTijolo / total < 0.3;
    const segsTenho = new Set(fiis.map(f => (f.extra && f.extra.segmento || "").toLowerCase()).filter(Boolean));
    const cands = (ranking || []).filter(r => !tenho.has(r.ticker) && r.liquidez >= 1000000 && r.pvp >= 0.8 && r.pvp <= 1.02 && r.dy12m >= 7 && r.dy12m <= 16 && r.cotacao > 0)
      .filter(r => ehPapelSeg(r.segmento) || !Number.isFinite(r.vacancia) || r.vacancia <= 12)
      .map(r => {
        const papel = ehPapelSeg(r.segmento);
        const b = papel ? ref.PAPEL : ref.TIJOLO;
        let s = (1 - r.pvp) * 10 + (r.dy12m - b) / 2 + Math.log10(r.liquidez) / 2;
        if (!segsTenho.has((r.segmento || "").toLowerCase())) s += 1;
        if (poucoTijolo && !papel) s += 2;
        return { ...r, s, papel };
      })
      .sort((a, b) => b.s - a.s);
    const porSeg = {}; const out = [];
    for (const c of cands) { const k = c.segmento || "?"; if ((porSeg[k] || 0) >= 2) continue; porSeg[k] = (porSeg[k] || 0) + 1; out.push(c); if (out.length >= qtd) break; }
    return out;
  }

  function relatorio(fiis, cfg, ranking) {
    const an = fiis.map(f => ({ f, a: analisar(f, cfg, ranking) }));
    let total = 0; const porTipo = {};
    for (const f of fiis) { const v = (f.qtd || 0) * (f.cotacao || 0); total += v; porTipo[f.tipo] = (porTipo[f.tipo] || 0) + v; }
    const renda = fiis.reduce((s, f) => s + (f.qtd || 0) * (f.dividendo || 0), 0);
    const alertas = [];
    for (const [t, v] of Object.entries(porTipo)) if (total && v / total > 0.4) alertas.push(`${t} representa ${PCT.format(v / total)} do patrimônio. Concentração alta em um único tipo aumenta o risco.`);
    if (total && (porTipo.TIJOLO || 0) / total < 0.2) alertas.push("Pouca exposição a fundos de tijolo (imóveis físicos), que costumam proteger melhor contra a inflação no longo prazo.");
    const maior = fiis.map(f => ({ f, v: (f.qtd || 0) * (f.cotacao || 0) })).sort((a, b) => b.v - a.v)[0];
    if (maior && total && maior.v / total > 0.15) alertas.push(`${maior.f.id} sozinho é ${PCT.format(maior.v / total)} da carteira.`);

    const grupo = (v) => an.filter(x => x.a.veredito === v).sort((a, b) => b.a.score - a.a.score);
    const linhaFii = ({ f, a }) => {
      const x = f.extra || {}; const bits = [];
      if (Number.isFinite(x.pvp)) bits.push("P/VP " + N2.format(x.pvp));
      const dy = Number.isFinite(x.dy12m) ? x.dy12m : (f.cotacao ? f.dividendo * 1200 / f.cotacao : null);
      if (dy) bits.push("DY " + N2.format(dy) + "%");
      return `- **${f.id}** — ${a.veredito} — ${bits.join(", ") || "sem dados de mercado"}`;
    };
    const sug = sugestoes(fiis, ranking);
    const linhas = [
      "## Visão geral",
      `Como seu consultor em fundos imobiliários, revisei a carteira: ${fiis.length} fundos, patrimônio de ${BRL.format(total)} e renda estimada de ${BRL.format(renda)} por mês.`,
      ...alertas.map(s => "- " + s),
      "## Minhas indicações para os FIIs que você tem",
      ...grupo("COMPRAR").map(linhaFii), ...grupo("MANTER").map(linhaFii), ...grupo("VENDER").map(linhaFii),
      "## Sugestões de FIIs novos para avaliar",
      ...(sug.length ? sug.map(r => `- **${r.ticker}** — ${r.segmento} — cotação ${BRL.format(r.cotacao)}, P/VP ${N2.format(r.pvp)}, DY ${N2.format(r.dy12m)}%, liquidez ${BRL.format(r.liquidez)}/dia${Number.isFinite(r.vacancia) && !r.papel ? ", vacância " + N2.format(r.vacancia) + "%" : ""}`)
        : ["- Sem ranking de mercado ainda. Rode a atualização automática no GitHub (Actions → Atualizar dados dos FIIs → Run workflow)."]),
      "## Próximos passos recomendados",
      `- Priorize seus aportes nos fundos marcados como COMPRAR, começando pelos que estão mais longe da meta de ${cfg.meta} cotas.`,
      "- Antes de vender um fundo marcado como VENDER, leia o último relatório gerencial: um P/VP baixo às vezes é só um momento ruim do mercado, e não um problema do fundo.",
      "- Use as sugestões para diversificar por tipo, segmento e gestora, principalmente nos tipos que hoje têm pouco peso na carteira.",
      "- Reavalie a carteira todo mês, quando saem os relatórios gerenciais e os dividendos.",
      "",
      "Fontes: dados/mercado.json (Status Invest, Investidor10 e Fundamentus). Relatório automático por regras, no papel de consultor especialista em FIIs."
    ];
    return { texto: linhas.join("\n"), analises: an };
  }

  window.Regras = { analisar, relatorio, sugestoes, referencias };
})();
