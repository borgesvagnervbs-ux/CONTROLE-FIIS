# Carteira de FIIs

Sistema web (HTML, CSS e JavaScript puros) para acompanhar uma carteira de fundos imobiliários e Fiagros. Ele reproduz a planilha "TABELA FIIS" e acrescenta:

- **Quantidade é a única coisa que você digita.** Cotação, último dividendo, DY de 12 meses, P/VP, liquidez e vacância são buscados sozinhos todo dia útil.
- **Todas as colunas da planilha**, com as mesmas fórmulas: dividendos atuais, DY mensal e anual, patrimônio, número mágico, meta, investimento por mês etc.
- **Botão "Analisar" em cada FII**, com veredito COMPRAR, MANTER ou VENDER.
- **Relatório geral** com indicações para os FIIs que você tem e sugestões de FIIs novos tiradas do ranking de todos os FIIs.
- Funciona sem custo nenhum. Opcionalmente, com uma chave da API da Anthropic, as análises são feitas pelo Claude com pesquisa na internet (notícias e relatórios gerenciais).

> Aviso: ferramenta pessoal. As análises são automáticas e podem conter erros. Não é recomendação de investimento profissional.

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| `index.html`, `css/`, `js/` | No seu navegador (GitHub Pages) | Mostra a tabela, guarda suas quantidades **só no seu navegador** (localStorage), faz as análises |
| `scripts/atualizar_dados.py` | No GitHub Actions, todo dia útil às 18:30 | Lê Status Invest, Investidor10 e Fundamentus e grava `dados/mercado.json` |
| `dados/tickers.json` | No repositório | Lista de FIIs que o robô deve atualizar |

Por que assim: um site estático não consegue ler o Status Invest direto do navegador (o site bloqueia, regra de CORS). O GitHub Actions busca os dados no servidor e o site só lê o arquivo pronto.

**Privacidade:** suas quantidades não vão para o repositório (que no GitHub Pages gratuito precisa ser público). Só a lista de códigos dos FIIs fica pública, em `dados/tickers.json`.

## Instalação (uma vez só, uns 10 minutos)

1. **Crie um repositório** no GitHub (por exemplo `carteira-fiis`), público, com a branch `main`.
2. **Envie todos os arquivos desta pasta** mantendo as pastas, inclusive a pasta oculta `.github`.
   - Pelo site do GitHub: "Add file" → "Upload files" e arraste o conteúdo da pasta. Se a pasta `.github` não for junto, crie o arquivo `.github/workflows/atualizar-dados.yml` em "Add file" → "Create new file" e cole o conteúdo.
   - Pelo terminal: `git init`, `git add .`, `git commit -m "Carteira de FIIs"`, `git branch -M main`, `git remote add origin https://github.com/SEU_USUARIO/carteira-fiis.git`, `git push -u origin main`.
3. **Ative o GitHub Pages:** Settings → Pages → em "Source" escolha **GitHub Actions**.
4. **Dê permissão de escrita ao robô:** Settings → Actions → General → "Workflow permissions" → **Read and write permissions** → Save.
5. **Rode a primeira atualização:** aba Actions → "Atualizar dados dos FIIs e publicar o site" → **Run workflow**. Leva de 2 a 5 minutos.
6. **Abra o site** no endereço que aparece em Settings → Pages, algo como `https://SEU_USUARIO.github.io/carteira-fiis/`.

Depois disso, os dados se atualizam sozinhos de segunda a sexta às 18:30 (horário de Brasília). Para atualizar em outro horário, use o botão "Atualizar dados agora" (veja abaixo) ou repita o passo 5.

## Uso do dia a dia

- **Quantidades:** digite na coluna "Quantidade". Fica salvo no navegador.
- **Adicionar ou remover FII:** use o formulário "Adicionar FII" ou o botão "Remover". Depois copie a lista em **Configurações e backup** e cole no arquivo `dados/tickers.json` do repositório, para o robô passar a atualizar esse FII.
- **Outro computador ou celular:** em Configurações, "Baixar backup" e depois "Restaurar backup" no outro aparelho.
- **Metas:** altere "Meta de cotas por FII" e "Período (anos)", como na planilha (E3 e E4).

## Botão "Atualizar dados agora" (sem abrir o GitHub)

Além da atualização automática de segunda a sexta às 18:30, o botão **Atualizar dados agora** no topo do site pede ao GitHub para buscar os dados na hora, mostra o andamento e carrega os valores novos quando termina (de 2 a 5 minutos).

Para o botão funcionar, ele precisa de um token do GitHub. Faça uma vez em cada navegador onde for usar:

1. Abra https://github.com/settings/personal-access-tokens/new (Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. **Token name:** `carteira-fiis`. **Expiration:** escolha a validade (por exemplo 1 ano; quando vencer, crie outro).
3. **Repository access:** marque **Only select repositories** e escolha **CONTROLE-FIIS**.
4. **Permissions → Repository permissions:** **Actions: Read and write** e **Contents: Read-only**. Não marque mais nada.
5. Clique em **Generate token** e copie o código (começa com `github_pat_`).
6. No site, abra **Configurações e backup**, cole em "Token do GitHub" e clique em **Salvar**.

Segurança: o token fica só no seu navegador e vai apenas para api.github.com. Com essas permissões ele só consegue rodar o robô e ler arquivos deste repositório. Nunca coloque o token em um arquivo do repositório, porque ele é público. Se perder o aparelho, apague o token em https://github.com/settings/personal-access-tokens.

## Análises

**Sem chave (grátis):** regras automáticas que comparam o P/VP, o dividend yield com a média de fundos do mesmo tipo, a liquidez e a vacância. As sugestões de FIIs novos vêm do ranking do Fundamentus (liquidez acima de R$ 1 milhão por dia, P/VP entre 0,80 e 1,02, DY entre 7% e 16%), dando preferência aos tipos que têm pouco peso na sua carteira.

**Com o Claude (pago, opcional):**
1. Crie uma chave em https://console.anthropic.com (menu API Keys) e coloque créditos na conta.
2. No site, abra **Configurações e backup**, cole a chave, escolha o modelo e clique em Salvar.
3. Os botões "Analisar" e "Gerar relatório geral" passam a pesquisar na internet (Status Invest, Investidor10, FIIs.com.br, Funds Explorer, Clube FII, InfoMoney, Suno e outros).

A chave fica só no seu navegador e vai direto para `api.anthropic.com`. Não use a chave em computador de outras pessoas. O modelo mais barato é o Haiku; o mais completo é o Opus. Uma análise de um FII custa poucos centavos de dólar, e o relatório geral custa um pouco mais.

## Problemas comuns

- **"Os dados de mercado ainda não foram baixados":** rode o passo 5 da instalação.
- **Um FII aparece como "não atualizado":** o robô não conseguiu ler a página dele. Veja o motivo em `dados/mercado.json` (campo `erros`) ou no log da aba Actions. Os sites às vezes mudam o layout ou bloqueiam acessos; nesse caso o último valor conhecido é mantido.
- **Abrindo o `index.html` direto do computador** o navegador não deixa ler `dados/mercado.json`. Use o endereço do GitHub Pages, ou rode `python -m http.server` na pasta e abra http://localhost:8000.
- **O GitHub desativou a atualização automática:** em repositórios sem atividade por 60 dias o GitHub pausa os agendamentos. Entre na aba Actions e reative.
- **Testar o robô no seu computador:** `python scripts/atualizar_dados.py` (Python 3.9 ou mais novo, sem instalar nada).
