/* Botão "Atualizar agora": dispara o workflow do GitHub Actions pela API do GitHub,
   acompanha a execução e avisa quando os dados novos estão prontos.
   O token fica só neste navegador (localStorage), nunca no repositório. */
(function () {
  "use strict";
  const API = "https://api.github.com";
  const WORKFLOW = "atualizar-dados.yml";
  const PADRAO = { dono: "borgesvagnervbs-ux", repo: "CONTROLE-FIIS" };

  /* No GitHub Pages o endereço é https://DONO.github.io/REPO/ */
  function repoDoEndereco() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return m && seg ? { dono: m[1], repo: seg } : null;
  }

  function config() {
    const c = window.U.ler("fiis.github", {});
    const auto = repoDoEndereco() || PADRAO;
    return { token: c.token || "", dono: c.dono || auto.dono, repo: c.repo || auto.repo };
  }
  const temToken = () => !!config().token;

  async function api(caminho, opcoes = {}) {
    const { token, dono, repo } = config();
    const r = await fetch(`${API}/repos/${encodeURIComponent(dono)}/${encodeURIComponent(repo)}${caminho}`, {
      ...opcoes,
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", ...(opcoes.headers || {}) },
      cache: "no-store"
    });
    if (!r.ok) {
      let msg = ""; try { msg = (await r.json()).message || ""; } catch { /* sem corpo */ }
      const e = new Error(msg || "HTTP " + r.status); e.status = r.status; throw e;
    }
    return r;
  }

  function explicarErro(e) {
    if (!e) return "Erro desconhecido.";
    if (e.status === 401) return "Token do GitHub inválido ou vencido. Crie outro em Configurações.";
    if (e.status === 403) return "O token não tem permissão. Ele precisa de Actions: leitura e escrita e Contents: leitura neste repositório.";
    if (e.status === 404) return "Repositório ou workflow não encontrado. Confira o dono e o nome do repositório em Configurações e se o token dá acesso a ele.";
    if (e.status === 422) return "O GitHub recusou o pedido. Confira se a branch main existe e se o workflow tem o gatilho workflow_dispatch.";
    if (e instanceof TypeError) return "Sem conexão com o GitHub. Verifique sua internet.";
    return e.message || "Erro ao falar com o GitHub.";
  }

  const esperar = (ms, signal) => new Promise((ok, falha) => {
    const t = setTimeout(ok, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); falha(Object.assign(new Error("Interrompido."), { name: "AbortError" })); }, { once: true });
  });

  const ROTULO = { queued: "na fila", waiting: "aguardando", pending: "aguardando", requested: "na fila", in_progress: "em andamento" };

  /* Dispara o workflow e espera ele terminar. onStatus recebe textos para mostrar na tela.
     Resolve com {conclusao, url}. */
  async function atualizarAgora({ onStatus, signal } = {}) {
    const inicio = Date.now() - 5000;
    onStatus("Pedindo ao GitHub para buscar os dados…");
    await api(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }), headers: { "Content-Type": "application/json" }, signal });

    let run = null;
    const limite = Date.now() + 20 * 60 * 1000;
    while (Date.now() < limite) {
      await esperar(run ? 10000 : 4000, signal);
      const r = await api(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=5`, { signal });
      const j = await r.json();
      run = (j.workflow_runs || []).find(x => new Date(x.created_at).getTime() >= inicio) || null;
      if (!run) { onStatus("Esperando o GitHub iniciar a atualização…"); continue; }
      if (run.status === "completed") return { conclusao: run.conclusion, url: run.html_url };
      const min = Math.max(0, Math.round((Date.now() - new Date(run.created_at).getTime()) / 60000));
      onStatus(`Atualização ${ROTULO[run.status] || run.status} no GitHub (${min} min). Costuma levar de 2 a 5 minutos.`);
    }
    return { conclusao: "timeout", url: run && run.html_url };
  }

  /* Lê o mercado.json direto do repositório (sem esperar o cache do site). */
  async function lerMercado(signal) {
    const r = await api(`/contents/dados/mercado.json?ref=main`, { headers: { Accept: "application/vnd.github.raw+json" }, signal });
    return r.json();
  }

  window.GH = { config, temToken, atualizarAgora, lerMercado, explicarErro };
})();
