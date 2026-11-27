/* Análise com o Claude (opcional): chamada direta à API da Anthropic a partir do navegador,
   com a chave do próprio usuário e a ferramenta de busca na web. */
(function () {
  "use strict";
  const URL_API = "https://api.anthropic.com/v1/messages";
  const SITES = ["statusinvest.com.br", "investidor10.com.br", "fundamentus.com.br", "fiis.com.br", "fundsexplorer.com.br", "clubefii.com.br", "b3.com.br", "infomoney.com.br", "suno.com.br", "valor.globo.com"];

  function config() { return window.U.ler("fiis.ia", { chave: "", modelo: "claude-opus-5-5" }); }
  function temChave() { return !!config().chave; }

  async function chamar(corpo, chave, signal) {
    const headers = {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    // Recuo automático para outro modelo se o principal recusar (Opus 5.5 e Sonnet 5.5).
    if (/opus-5-5|sonnet-5-5/.test(corpo.model)) { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; corpo.fallbacks = "default"; }
    const r = await fetch(URL_API, { method: "POST", headers, body: JSON.stringify(corpo), signal });
    let j = null; try { j = await r.json(); } catch { /* resposta sem JSON */ }
    if (!r.ok) {
      const msg = j && j.error && j.error.message ? j.error.message : "HTTP " + r.status;
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return j;
  }

  /* Pergunta ao Claude com busca na web; trata pause_turn (busca longa) e recusa. */
  async function perguntar(prompt, { signal, onStatus, maxBuscas = 5 } = {}) {
    const { chave, modelo } = config();
    if (!chave) throw new Error("Configure a chave da API em Configurações.");
    const messages = [{ role: "user", content: prompt }];
    const tools = [{ type: modelo.includes("haiku") ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: maxBuscas, allowed_domains: SITES }];
    let texto = "";
    for (let volta = 0; volta < 5; volta++) {
      onStatus && onStatus(volta ? "Continuando a pesquisa…" : "Pesquisando na internet e escrevendo… (pode levar 1 a 3 minutos)");
      const corpo = { model: modelo, max_tokens: 16000, messages, tools, output_config: { effort: "medium" } };
      const resp = await chamar(corpo, chave, signal);
      if (resp.stop_reason === "refusal") throw new Error("O modelo recusou esta análise. Tente outro modelo nas Configurações.");
      texto = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (resp.stop_reason === "pause_turn") { messages.splice(1); messages.push({ role: "assistant", content: resp.content }); continue; }
      return { texto, cortado: resp.stop_reason === "max_tokens" };
    }
    return { texto, cortado: true };
  }

  function explicarErro(e) {
    if (!e) return "Erro desconhecido.";
    if (e.name === "AbortError") return "Interrompido.";
    if (e.status === 401) return "Chave da API inválida. Confira em Configurações.";
    if (e.status === 403) return "Sua chave não tem permissão para este modelo ou para a busca na web.";
    if (e.status === 429) return "Limite de uso da API atingido. Espere alguns minutos.";
    if (e.status === 529 || e.status >= 500) return "A API da Anthropic está sobrecarregada. Tente de novo em instantes.";
    if (e instanceof TypeError) return "Não foi possível conectar à API da Anthropic. Verifique sua internet.";
    return e.message || "Erro ao gerar a análise.";
  }

  window.IA = { config, temChave, perguntar, explicarErro, SITES };
})();
