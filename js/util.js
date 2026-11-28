/* Funções de apoio: formatação, criação de elementos, markdown simples e cálculos da planilha. */
(function () {
  "use strict";
  const U = {};
  U.BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  U.N2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  U.N3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  U.N0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  U.PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  U.fmtData = (iso) => { try { return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""; } catch { return ""; } };
  U.num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? null : +v;

  U.ler = (chave, padrao) => { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
  U.gravar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; } };
  U.apagar = (chave) => { try { localStorage.removeItem(chave); } catch { /* nada */ } };

  U.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) if (k !== null && k !== undefined) e.append(k);
    return e;
  };

  /* Markdown simples e seguro (nunca usa innerHTML). */
  U.renderMd = function (alvo, texto) {
    alvo.textContent = "";
    let ul = null;
    const inline = (pai, s) => {
      for (const p of s.split(/(\*\*[^*]+\*\*)/g)) {
        if (/^\*\*[^*]+\*\*$/.test(p)) pai.append(U.el("strong", { text: p.slice(2, -2) }));
        else if (p) pai.append(p.replace(/(^|\s)\*([^*]+)\*/g, "$1$2"));
      }
    };
    for (const bruto of String(texto || "").split("\n")) {
      const linha = bruto.trimEnd();
      if (/^\s*[-*•]\s+/.test(linha)) {
        if (!ul) { ul = U.el("ul"); alvo.append(ul); }
        const li = U.el("li"); inline(li, linha.replace(/^\s*[-*•]\s+/, "")); ul.append(li); continue;
      }
      ul = null;
      if (!linha.trim()) continue;
      let m;
      if ((m = linha.match(/^#{1,2}\s+(.*)/))) { alvo.append(U.el("h3", { text: m[1].replace(/\*\*/g, "") })); continue; }
      if ((m = linha.match(/^#{3,6}\s+(.*)/))) { alvo.append(U.el("h4", { text: m[1].replace(/\*\*/g, "") })); continue; }
      if (/^\|/.test(linha)) {
        if (/^\|[\s:|-]+\|$/.test(linha)) continue;
        const p = U.el("p"); inline(p, linha.replace(/^\||\|$/g, "").split("|").map(s => s.trim()).join("  ·  ")); alvo.append(p); continue;
      }
      const p = U.el("p"); inline(p, linha); alvo.append(p);
    }
  };

  /* Mesmas fórmulas da planilha (colunas C a S). Q = período da meta em meses. */
  U.calc = function (f, cfg) {
    const C = +f.qtd || 0, D = +f.cotacao || 0, E = +f.dividendo || 0;
    const L = +cfg.meta || 0, Q = Math.max(1, +cfg.meses || 12);
    const F = E * C, G = D ? E / D : 0, H = G * 12, I = C * D, J = E ? D / E : 0;
    const K = J - C, M = L - C, N = M * D, O = E * L, P = L * D, R = (M / Q) * D, S = R - F;
    return { C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S };
  };

  U.TIPO_COR = { FIAGRO: "--fiagro", PAPEL: "--papel", TIJOLO: "--tijolo", FOF: "--fof", ENERGIA: "--energia" };
  U.corTipo = (t) => `var(${U.TIPO_COR[t] || "--outro"})`;

  window.U = U;
})();
