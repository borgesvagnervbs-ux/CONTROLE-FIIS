#!/usr/bin/env python3
"""
Atualiza dados/mercado.json com cotação, último rendimento, DY, P/VP e outros
indicadores dos FIIs listados em dados/tickers.json, e o ranking geral de FIIs
do Fundamentus (usado para sugerir fundos novos).

Roda no GitHub Actions (ver .github/workflows/atualizar-dados.yml) ou no seu
computador:  python scripts/atualizar_dados.py

Usa só a biblioteca padrão do Python (sem pip install).
Fontes: statusinvest.com.br (principal), investidor10.com.br (reserva),
fundamentus.com.br (ranking). Os sites podem mudar o layout; se um FII falhar,
o valor anterior é mantido e o erro fica registrado no JSON.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ_TICKERS = os.path.join(RAIZ, "dados", "tickers.json")
ARQ_MERCADO = os.path.join(RAIZ, "dados", "mercado.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}

NUM = r"(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)"


def baixar(url, tentativas=3):
    erro = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                bruto = r.read()
                cs = r.headers.get_content_charset() or "utf-8"
                try:
                    return bruto.decode(cs, errors="replace")
                except LookupError:
                    return bruto.decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            erro = e
            time.sleep(2 + i * 3)
    raise RuntimeError(f"falha ao baixar {url}: {erro}")


def texto_da_pagina(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|span|strong|td|th)>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    h = html.unescape(h)
    h = re.sub(r"[ \t\r\f\v\xa0]+", " ", h)
    h = re.sub(r"\n\s*", "\n", h)
    return h


def para_float(s):
    if s is None:
        return None
    s = s.strip().replace("R$", "").replace("%", "").strip()
    if not s or s in {"-", "--"}:
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def numero_apos(txt, rotulos, janela=120, mult_sufixo=False):
    """Primeiro número que aparece logo depois de um dos rótulos."""
    for rot in rotulos:
        for m in re.finditer(rot, txt, flags=re.I):
            trecho = txt[m.end(): m.end() + janela]
            n = re.search(NUM + r"\s*(mil|mi|m|b|bi|k)?\b", trecho, flags=re.I)
            if n:
                v = para_float(n.group(1))
                if v is None:
                    continue
                suf = (n.group(2) or "").lower()
                if mult_sufixo and suf:
                    v *= {"k": 1e3, "mil": 1e3, "m": 1e6, "mi": 1e6, "b": 1e9, "bi": 1e9}[suf]
                return v
    return None


def texto_apos(txt, rotulos, janela=80):
    for rot in rotulos:
        m = re.search(rot + r"\s*\n?\s*([^\n]{2,60})", txt[:200000], flags=re.I)
        if m:
            v = m.group(1).strip(" :-")
            if v and not re.match(r"^[\d.,%R$ ]+$", v):
                return v[:60]
    return None


def extrair_statusinvest(txt):
    d = {
        "cotacao": numero_apos(txt, [r"\bValor atual\b"]),
        "dividendo": numero_apos(txt, [r"[ÚU]ltimo rendimento"], janela=200),
        "dy12m": numero_apos(txt, [r"Dividend Yield"], janela=60),
        "pvp": numero_apos(txt, [r"\bP/VP\b"], janela=40),
        "vpCota": numero_apos(txt, [r"Val\. patrimonial p/cota", r"Valor patrimonial p/cota"]),
        "liquidez": numero_apos(txt, [r"Liquidez m[ée]dia di[áa]ria"], mult_sufixo=True),
        "vacancia": numero_apos(txt, [r"Vac[âa]ncia f[íi]sica", r"Vac[âa]ncia"], janela=60),
        "cotistas": numero_apos(txt, [r"N[º°o]\.? de cotistas", r"Cotistas"], janela=60),
        "segmento": texto_apos(txt, [r"Segmento"]),
    }
    return d


def extrair_investidor10(txt):
    return {
        "cotacao": numero_apos(txt, [r"\bCota[çc][ãa]o\b"]),
        "dividendo": numero_apos(txt, [r"[ÚU]ltimo rendimento"], janela=200),
        "dy12m": numero_apos(txt, [r"DY\s*\(12M\)", r"Dividend Yield"], janela=60),
        "pvp": numero_apos(txt, [r"\bP/VP\b"], janela=40),
        "vpCota": numero_apos(txt, [r"Valor Patrimonial p/ ?Cota"]),
        "liquidez": numero_apos(txt, [r"Liquidez Di[áa]ria"], mult_sufixo=True),
        "vacancia": numero_apos(txt, [r"Vac[âa]ncia"], janela=60),
        "cotistas": numero_apos(txt, [r"Numero de cotistas", r"N[úu]mero de cotistas"], janela=60),
        "segmento": texto_apos(txt, [r"Segmento"]),
    }


def coletar_fii(ticker, tipo):
    t = ticker.lower()
    if (tipo or "").upper() == "FIAGRO":
        urls = [("statusinvest", f"https://statusinvest.com.br/fiagros/{t}"),
                ("statusinvest", f"https://statusinvest.com.br/fundos-imobiliarios/{t}"),
                ("investidor10", f"https://investidor10.com.br/fiagros/{t}/")]
    else:
        urls = [("statusinvest", f"https://statusinvest.com.br/fundos-imobiliarios/{t}"),
                ("investidor10", f"https://investidor10.com.br/fiis/{t}/")]
    erros = []
    for fonte, url in urls:
        try:
            txt = texto_da_pagina(baixar(url))
            if ticker.upper() not in txt.upper():
                erros.append(f"{url}: página não é do {ticker}")
                continue
            d = extrair_statusinvest(txt) if fonte == "statusinvest" else extrair_investidor10(txt)
            if any(d.get(k) for k in ("cotacao", "dividendo", "dy12m", "pvp")):
                d["fonte"] = url
                return d, None
            erros.append(f"{url}: indicadores não encontrados")
        except Exception as e:  # noqa: BLE001
            erros.append(str(e)[:200])
        time.sleep(1.5)
    return None, " | ".join(erros)


def coletar_ranking():
    """Tabela de todos os FIIs do Fundamentus (não inclui a maioria dos Fiagros)."""
    h = baixar("https://www.fundamentus.com.br/fii_resultado.php")
    corpo = re.search(r"(?is)<tbody>(.*?)</tbody>", h)
    if not corpo:
        raise RuntimeError("tabela do Fundamentus não encontrada")
    lista = []
    for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", corpo.group(1)):
        tds = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
               for c in re.findall(r"(?is)<td[^>]*>(.*?)</td>", tr)]
        if len(tds) < 13:
            continue
        lista.append({
            "ticker": tds[0].upper(),
            "segmento": tds[1],
            "cotacao": para_float(tds[2]),
            "ffoYield": para_float(tds[3]),
            "dy12m": para_float(tds[4]),
            "pvp": para_float(tds[5]),
            "valorMercado": para_float(tds[6]),
            "liquidez": para_float(tds[7]),
            "imoveis": para_float(tds[8]),
            "capRate": para_float(tds[11]),
            "vacancia": para_float(tds[12]),
        })
    if not lista:
        raise RuntimeError("nenhuma linha lida no Fundamentus")
    return lista


def faixa(v, minimo, maximo):
    return v if isinstance(v, (int, float)) and minimo <= v <= maximo else None


def combinar(tk, pagina, rk, anterior):
    """Junta a página do fundo (Status Invest/Investidor10) com a linha do ranking do
    Fundamentus. Cotação, P/VP e liquidez vêm do ranking, que é uma tabela simples e
    confiável; dividendo e DY vêm da página do fundo (o Fundamentus não traz o DY dos
    Fiagros). Todo valor passa por uma checagem de faixa para descartar leituras erradas."""
    pagina = pagina or {}
    rk = rk or {}
    anterior = anterior or {}
    d = {}
    d["cotacao"] = faixa(rk.get("cotacao"), 0.5, 5000) or faixa(pagina.get("cotacao"), 0.5, 5000)
    cot = d["cotacao"]
    d["pvp"] = faixa(rk.get("pvp"), 0.1, 5) or faixa(pagina.get("pvp"), 0.1, 5)
    d["liquidez"] = faixa(rk.get("liquidez"), 0, 1e10) if rk.get("liquidez") else faixa(pagina.get("liquidez"), 0, 1e10)
    d["dy12m"] = faixa(pagina.get("dy12m"), 0.5, 40) or faixa(rk.get("dy12m"), 0.5, 40)
    div = pagina.get("dividendo")
    if cot and div and not (0.002 <= div / cot <= 0.04):  # rendimento mensal entre 0,2% e 4%
        div = None
    if not div and anterior.get("dividendo") and cot and 0.002 <= anterior["dividendo"] / cot <= 0.04:
        div = anterior["dividendo"]
    d["dividendo"] = div
    d["vpCota"] = faixa(pagina.get("vpCota"), 0.5, 5000) or (round(cot / d["pvp"], 2) if cot and d["pvp"] else None)
    vac = rk.get("vacancia") if rk else None
    d["vacancia"] = faixa(pagina.get("vacancia"), 0, 100) if pagina.get("vacancia") else faixa(vac, 0, 100)
    d["cotistas"] = pagina.get("cotistas")
    d["segmento"] = rk.get("segmento") or None
    fontes = [x for x in (pagina.get("fonte"), "https://www.fundamentus.com.br/fii_resultado.php" if rk else None) if x]
    d["fonte"] = " + ".join(fontes) if fontes else None
    return d


def main():
    with open(ARQ_TICKERS, encoding="utf-8") as f:
        tickers = json.load(f)
    try:
        with open(ARQ_MERCADO, encoding="utf-8") as f:
            mercado = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        mercado = {}
    mercado.setdefault("fiis", {})
    mercado.setdefault("ranking", [])
    mercado["erros"] = {}
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")

    try:
        mercado["ranking"] = coletar_ranking()
        mercado["rankingAtualizadoEm"] = agora
        print(f"Ranking: {len(mercado['ranking'])} FIIs")
    except Exception as e:  # noqa: BLE001
        mercado["erros"]["_ranking"] = str(e)[:300]
        print(f"ERRO ranking: {e}", file=sys.stderr)
    por_ticker = {r["ticker"]: r for r in mercado.get("ranking") or []}

    ok = 0
    for item in tickers:
        tk = item["ticker"].upper()
        pagina, erro = coletar_fii(tk, item.get("tipo"))
        d = combinar(tk, pagina, por_ticker.get(tk), mercado["fiis"].get(tk))
        if d.get("cotacao"):
            d["atualizadoEm"] = agora
            mercado["fiis"][tk] = d
            ok += 1
            print(f"OK   {tk}: cota {d.get('cotacao')} div {d.get('dividendo')} P/VP {d.get('pvp')} DY {d.get('dy12m')}")
            if erro:
                print(f"     aviso {tk}: {erro}", file=sys.stderr)
        else:
            mercado["erros"][tk] = erro or "sem cotação"
            print(f"ERRO {tk}: {mercado['erros'][tk]}", file=sys.stderr)
        time.sleep(2)

    mercado["atualizadoEm"] = agora
    with open(ARQ_MERCADO, "w", encoding="utf-8") as f:
        json.dump(mercado, f, ensure_ascii=False, indent=1)
    print(f"{ok} de {len(tickers)} FIIs atualizados.")
    if ok == 0 and tickers:
        sys.exit(1)


if __name__ == "__main__":
    main()
