import { getKnownSector } from "./sectorFetch";

const BRAPI_BASE = "https://brapi.dev/api";
const BRAPI_TOKEN = "cP3aB5r1TD7C8fjNYW5F14";

// Cache p/ evitar chamadas repetidas ao Yahoo (rate limit)
const yahooCache = new Map<string, Promise<{ sum12m: number; price: number } | null>>();

// Cloudflare Worker proxy - substitua pela sua URL após deploy
// Exemplo: "https://gestor-yahoo-proxy.seu-usuario.workers.dev"
const YAHOO_PROXY = "https://gestor-yahoo-proxy.mr-caastro.workers.dev";

interface BrapiDividend {
  value: number;
  date: string;
  type: string;
  yield?: number;
}

interface BrapiQuote {
  symbol: string;
  regularMarketPrice: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
  dividendsData?: BrapiDividend[];
}

interface BrapiResponse {
  results: BrapiQuote[];
  error?: string;
}

async function fetchQuotes(tickers: string[]): Promise<Map<string, BrapiQuote>> {
  if (tickers.length === 0) return new Map();
  const tickersStr = tickers.join(",");
  const url = `${BRAPI_BASE}/quote/${tickersStr}?fundamental=false&token=${BRAPI_TOKEN}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: BrapiResponse = await response.json();
    if (data.error) throw new Error(data.error);
    const map = new Map<string, BrapiQuote>();
    data.results?.forEach((q) => {
      if (q.symbol) map.set(q.symbol.toUpperCase(), q);
    });
    return map;
  } catch (error) {
    console.warn('BRAPI falhou, usando dados padrão:', error);
    // Fallback: usar dados padrão de FIIs
    const { FII_DEFAULTS } = await import('./fiiDefaults');
    const map = new Map<string, BrapiQuote>();
    for (const ticker of tickers) {
      const defaults = FII_DEFAULTS[ticker.toUpperCase()];
      if (defaults) {
        map.set(ticker.toUpperCase(), {
          symbol: ticker.toUpperCase(),
          regularMarketPrice: defaults.currentPrice,
          regularMarketChange: 0,
          regularMarketChangePercent: 0,
          dividendYield: null,
          dividendPerShare: defaults.dividendPerShare,
          dividendsData: []
        });
      }
    }
    return map;
  }
}

export async function updatePrices(
  assets: { id: string; ticker: string }[],
  onProgress: (ticker: string, status: 'ok' | 'error', price?: number) => void
): Promise<number> {
  const tickers = assets.map((a) => a.ticker);
  let updated = 0;
  const chunkSize = 1;
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    try {
      const quotes = await fetchQuotes(chunk);
      for (const asset of assets.slice(i, i + chunkSize)) {
        const quote = quotes.get(asset.ticker.toUpperCase());
        const { updateAsset } = await import('./store');
        const updates: Record<string, number> = {};
        let hasUpdate = false;

        // Atualizar preço se disponível
        if (quote && quote.regularMarketPrice != null && quote.regularMarketPrice > 0) {
          updates.currentPrice = quote.regularMarketPrice;
          hasUpdate = true;
        }

        // Tentar atualizar dividend - prioritário em dividendsData
        let divValue = 0;
        if (quote?.dividendsData && quote.dividendsData.length > 0) {
          const last = quote.dividendsData[quote.dividendsData.length - 1];
          if (last.value > 0) divValue = last.value;
        }
        if (divValue > 0) {
          updates.dividendPerShare = divValue;
          hasUpdate = true;
        } else if (quote?.dividendPerShare != null && quote.dividendPerShare > 0) {
          updates.dividendPerShare = quote.dividendPerShare;
          hasUpdate = true;
        }

        // Salvar mesmo que parcial (preço SEM dividend, ou dividend SEM preço)
        if (hasUpdate) {
          // Atualizar setor se vazio
          const knownSector = getKnownSector(asset.ticker);
          if (knownSector) {
            updateAsset(asset.id, { ...updates, sector: knownSector } as any);
          } else {
            updateAsset(asset.id, updates);
          }
          updated++;
          onProgress(asset.ticker, 'ok', quote?.regularMarketPrice ?? undefined);
        } else {
          onProgress(asset.ticker, 'error');
        }
      }
    } catch (e) {
      console.error('Chunk error:', e);
      for (const ticker of chunk) {
        onProgress(ticker, 'error');
      }
    }
  }
  return updated;
}

async function fetchYahooDividends(ticker: string): Promise<{ sum12m: number; price: number } | null> {
  const cached = yahooCache.get(ticker.toUpperCase());
  if (cached) return cached;
  const promise = (async () => {
    const yahooTicker = `${ticker}.SA`;
    const base = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=2y&interval=1d&events=dividends`;
    const PROXIES = [
      (url: string) => url,
      (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    ];
    try {
      let data: any = null;
      // Ordem: Cloudflare Worker > direto > proxies legados
      const allProxies = [
        ...(YAHOO_PROXY ? [(url: string) => `${YAHOO_PROXY}?url=${encodeURIComponent(url)}`] : []),
        ...PROXIES,
      ];
      for (const proxy of allProxies) {
        try {
          const url = proxy(base);
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          const json = await res.json();
          if (json?.chart?.result?.[0]) { data = json; break; }
        } catch { continue; }
      }
      if (!data) return null;
      const result = data.chart.result[0];
      const price = result.meta?.regularMarketPrice ?? 0;
      const dividends = result.events?.dividends;
      if (!dividends) return { sum12m: 0, price };
      const now = Date.now() / 1000;
      // Últimos 12 pagamentos dos últimos 2 anos
      const entries = Object.keys(dividends)
        .map((k) => dividends[k])
        .filter((d) => d.date >= now - 730 * 24 * 3600)
        .sort((a, b) => b.date - a.date);
      const last12 = entries.slice(0, 12);
      const sum12m = last12.reduce((s, d) => s + d.amount, 0);
      return { sum12m, price };
    } catch {
      return null;
    }
  })();
  yahooCache.set(ticker.toUpperCase(), promise);
  return promise;
}

// Fetch dividend per share from brapi.dev (primary source)
export async function fetchDividendFromBrapi(ticker: string): Promise<{ dividendo: number; yield: number; preco: number } | null> {
  try {
    const quotes = await fetchQuotes([ticker]);
    const quote = quotes.get(ticker.toUpperCase());
    if (!quote) return null;

    // priority 1: last actual dividend from dividendsData array
    if (quote.dividendsData && quote.dividendsData.length > 0) {
      const last = quote.dividendsData[quote.dividendsData.length - 1];
      if (last.value > 0) {
        return {
          dividendo: last.value,
          yield: (quote.dividendYield ?? 0) * 100,
          preco: quote.regularMarketPrice ?? 0,
        };
      }
    }

    return {
      dividendo: quote.dividendPerShare ?? 0,
      yield: (quote.dividendYield ?? 0) * 100,
      preco: quote.regularMarketPrice ?? 0,
    };
  } catch {
    return null;
  }
}

// Fetch dividend per share from investidor10.com.br (fallback)
const CORS_PROXIES = [
  ...(YAHOO_PROXY ? [`${YAHOO_PROXY}?url=`] : []),
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://api.codetabs.com/v1/proxy?quest=",
];

async function fetchViaProxy(url: string, timeout = 10000): Promise<string | null> {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(timeout) });
      if (res.ok) return await res.text();
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchDividendFromInvestidor10(ticker: string): Promise<{ dividendo: number; dy: number } | null> {
  try {
    const html = await fetchViaProxy(`https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`);
    if (!html) return null;

    let dividendo = 0;
    let dy = 0;

    // Extract "Último Dividendo" value - R$ 0,90 pattern
    const divMatch = html.match(/<div[^>]*>*\s*Último\s+Dividendo\s*<\/div>\s*<div[^>]*>\s*R?\$?\s*([\d.,]+)/i)
      || html.match(/Último\s+Dividendo[^]*?R?\$?\s*([\d.,]+)/i)
      || html.match(/"lastDividend"[^>]*>\s*R?\$?\s*([\d.,]+)/i)
      || html.match(/card-dividendos[^]*?R?\$?\s*([\d.,]+)/i);
    if (divMatch) {
      const v = parseFloat(divMatch[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(v) && v > 0) dividendo = v;
    }

    // Extract "Dividend Yield" percentage - 12,34% pattern
    const dyMatch = html.match(/<div[^>]*>*\s*Dividend\s+Yield\s*<\/div>\s*<div[^>]*>\s*([\d.,]+)\s*%/i)
      || html.match(/Dividend\s+Yield[^]*?([\d.,]+)\s*%/i)
      || html.match(/dy["'\]]*[^>]*>\s*([\d.,]+)\s*%/i)
      || html.match(/"dy"[^>]*>\s*([\d.,]+)\s*%/i);
    if (dyMatch) {
      const v = parseFloat(dyMatch[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(v) && v > 0) dy = v;
    }

    if (dividendo <= 0 && dy <= 0) return null;
    return { dividendo, dy };
  } catch {
    return null;
  }
}

export async function updateDividendsFromBrapi(
  tickers: string[],
  onProgress: (ticker: string, status: 'ok' | 'error', dividendo?: number) => void
): Promise<number> {
  let updated = 0;
  const { updateAsset, getAssets } = await import('./store');

  for (const ticker of tickers) {
    try {
      // Prioridade 1: Yahoo Finance via Worker
      const yh = await fetchYahooDividends(ticker);
      if (yh && yh.sum12m > 0) {
        const lastDiv = yh.sum12m / 12;
        if (lastDiv > 0) {
          const asset = getAssets().find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
          if (asset) {
            updateAsset(asset.id, { dividendPerShare: lastDiv });
            updated++;
            onProgress(ticker, 'ok', lastDiv);
            continue;
          }
        }
      }

      // Prioridade 2: brapi.dev
      const brapi = await fetchDividendFromBrapi(ticker);
      if (brapi && brapi.dividendo > 0) {
        const asset = getAssets().find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
        if (asset) {
          updateAsset(asset.id, { dividendPerShare: brapi.dividendo });
          updated++;
          onProgress(ticker, 'ok', brapi.dividendo);
          continue;
        }
      }

      // Prioridade 3: fiiDefaults (dados estáticos)
      const { FII_DEFAULTS } = await import('./fiiDefaults');
      const def = FII_DEFAULTS[ticker.toUpperCase()];
      if (def && def.dividendPerShare > 0) {
        const asset = getAssets().find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
        if (asset) {
          updateAsset(asset.id, { dividendPerShare: def.dividendPerShare });
          updated++;
          onProgress(ticker, 'ok', def.dividendPerShare);
          continue;
        }
      }

      // Prioridade 4: manter o dado existente (NÃO apagar)
      onProgress(ticker, 'error');
    } catch {
      onProgress(ticker, 'error');
    }
  }
  return updated;
}

async function fetchStatusInvestDividends(ticker: string): Promise<{ sum12m: number; price: number } | null> {
  try {
    const url = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract current price from the page
    const priceMatch = html.match(/"currentPrice":\s*"?(\d+[.,]\d+)"?/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : 0;
    // Extract last 12 dividends from proventos section
    const provMatch = html.match(/"proventos"\s*:\s*\[([\s\S]*?)\]/);
    if (!provMatch) return { sum12m: 0, price };
    let sum12m = 0;
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    try {
      const proventos = JSON.parse(`[${provMatch[1]}]`);
      for (const p of proventos) {
        if (p.dataPagamento) {
          const dt = new Date(p.dataPagamento);
          if (dt >= oneYearAgo) sum12m += p.valor || 0;
        }
      }
    } catch { /* ignore parse errors */ }
    return { sum12m, price };
  } catch {
    return null;
  }
}

export async function fetchDY12m(tickers: string[]): Promise<Map<string, { dy12m: number; price: number; last12Sum: number }>> {
  if (tickers.length === 0) return new Map();
  const result = new Map<string, { dy12m: number; price: number; last12Sum: number }>();
  const cap = 30;

  const results = await Promise.all(tickers.map((t) => fetchYahooDividends(t)));
  for (let i = 0; i < tickers.length; i++) {
    const yh = results[i];
    if (yh && yh.sum12m > 0 && yh.price > 0) {
      const dy12m = Math.min((yh.sum12m / yh.price) * 100, cap);
      result.set(tickers[i].toUpperCase(), { dy12m, price: yh.price, last12Sum: yh.sum12m });
    }
  }

  // Fallback: fiiDefaults para tickers que não tiveram dados do Yahoo
  if (result.size < tickers.length) {
    const { FII_DEFAULTS } = await import('./fiiDefaults');
    for (const ticker of tickers) {
      if (!result.has(ticker.toUpperCase())) {
        const def = FII_DEFAULTS[ticker.toUpperCase()];
        if (def && def.dividendPerShare > 0 && def.currentPrice > 0) {
          const annual = def.dividendPerShare * 12;
          const dy12m = Math.min((annual / def.currentPrice) * 100, cap);
          result.set(ticker.toUpperCase(), { dy12m, price: def.currentPrice, last12Sum: annual });
        }
      }
    }
  }

  return result;
}

export async function fetchLastDividends(tickers: string[]): Promise<Map<string, number>> {
  if (tickers.length === 0) return new Map();
  const result = new Map<string, number>();

  const results = await Promise.all(tickers.map((t) => fetchYahooDividends(t)));
  for (let i = 0; i < tickers.length; i++) {
    const yh = results[i];
    if (yh && yh.sum12m > 0) {
      const lastDiv = yh.sum12m / 12;
      if (lastDiv > 0) result.set(tickers[i].toUpperCase(), lastDiv);
    }
  }

  // Fallback: fiiDefaults para tickers sem dados do Yahoo
  if (result.size < tickers.length) {
    const { FII_DEFAULTS } = await import('./fiiDefaults');
    for (const ticker of tickers) {
      if (!result.has(ticker.toUpperCase())) {
        const def = FII_DEFAULTS[ticker.toUpperCase()];
        if (def && def.dividendPerShare > 0) {
          result.set(ticker.toUpperCase(), def.dividendPerShare);
        }
      }
    }
  }

  return result;
}

// Legacy - kept for backward compat
export async function updateDividendsFromInvestidor10(
  tickers: string[],
  onProgress: (ticker: string, status: 'ok' | 'error', dividendo?: number) => void
): Promise<number> {
  return updateDividendsFromBrapi(tickers, onProgress);
}

export function calcMonthlyDividendPerShare(
  dividendYield: number | null,
  price: number
): number {
  if (!dividendYield || !price) return 0;
  return (dividendYield * price) / 12;
}

// Busca proventos do Investidor10 e separa Dividendos de JCP (últimos 12 meses)
export async function fetchProventos(ticker: string): Promise<{ dividendos: number; jcp: number; total: number } | null> {
  try {
    const isFii = ticker.toUpperCase().endsWith('11');
    const path = isFii ? `fiis/${ticker.toLowerCase()}` : `acoes/${ticker.toLowerCase()}`;
    const html = await fetchViaProxy(`https://investidor10.com.br/${path}/proventos/`);
    if (!html) return null;

    const now = Date.now();
    const oneYearAgo = now - 365 * 86400 * 1000;

    // Padrão: <td>Tipo</td><td>Data</td><td>Pagamento</td><td>Valor</td>
    const pattern = /<td[^>]*>\s*(JSCP|JCP|Dividendo[s]?|Rend[^<]*)\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/gi;

    let dividendos = 0;
    let jcp = 0;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const [, tipo, dataCom, , valorStr] = match;
      const dm = dataCom.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!dm) continue;
      const dt = new Date(parseInt(dm[3]), parseInt(dm[2]) - 1, parseInt(dm[1]));
      if (dt.getTime() < oneYearAgo) continue;

      const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(valor) || valor <= 0) continue;

      const t = tipo.toUpperCase();
      if (t.includes('JCP') || t.includes('JSCP')) {
        jcp += valor;
      } else {
        dividendos += valor;
      }
    }

    return { dividendos, jcp, total: dividendos + jcp };
  } catch {
    return null;
  }
}

// Cache de proventos
const proventosCache = new Map<string, Promise<{ dividendos: number; jcp: number; total: number } | null>>();

export async function fetchProventosCached(ticker: string) {
  const cached = proventosCache.get(ticker.toUpperCase());
  if (cached) return cached;
  const promise = fetchProventos(ticker);
  proventosCache.set(ticker.toUpperCase(), promise);
  return promise;
}

export interface UpcomingDividend {
  ticker: string;
  date: string;
  value: number;
  type: string;
}

export async function fetchUpcomingDividends(tickers: string[]): Promise<UpcomingDividend[]> {
  if (tickers.length === 0) return [];
  const results: UpcomingDividend[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const ticker of tickers) {
    try {
      const isFii = ticker.toUpperCase().endsWith('11');
      const path = isFii ? `fiis/${ticker.toLowerCase()}` : `acoes/${ticker.toLowerCase()}`;
      const html = await fetchViaProxy(`https://investidor10.com.br/${path}/proventos/`);
      if (!html) continue;

      const pattern = /<td[^>]*>\s*(Dividendo[s]?|Rend[^<]*)\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/gi;
      const entries: { tipo: string; dataCom: string; pagamento: string; valor: number; payDate: Date }[] = [];
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const [, tipo, , pagamento, valorStr] = match;
        const pm = pagamento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!pm) continue;
        const payDate = new Date(parseInt(pm[3]), parseInt(pm[2]) - 1, parseInt(pm[1]));
        const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(valor) || valor <= 0) continue;
        entries.push({ tipo, dataCom: match[2], pagamento, valor, payDate });
      }

      if (entries.length < 3) continue;

      const recent = entries.slice(0, 12);
      const avgValor = recent.reduce((s, e) => s + e.valor, 0) / recent.length;

      const payMonths = recent.map((e) => {
        const d = e.payDate;
        return { month: d.getMonth(), day: d.getDate() };
      });
      const monthFreq: Record<number, { count: number; avgDay: number; month: number }> = {};
      for (const pm of payMonths) {
        if (!monthFreq[pm.month]) monthFreq[pm.month] = { count: 0, avgDay: 0, month: pm.month };
        monthFreq[pm.month].count++;
        monthFreq[pm.month].avgDay += pm.day;
      }
      for (const key of Object.keys(monthFreq)) {
        monthFreq[key].avgDay = Math.round(monthFreq[key].avgDay / monthFreq[key].count);
      }

      const now = new Date();
      for (let m = 0; m < 12; m++) {
        const targetMonth = (now.getMonth() + m) % 12;
        const targetYear = now.getFullYear() + Math.floor((now.getMonth() + m) / 12);
        const freq = monthFreq[targetMonth];
        if (!freq || freq.count < 2) continue;

        const payDate = new Date(targetYear, targetMonth, freq.avgDay);
        if (payDate <= now) continue;

        const dateStr = payDate.toISOString().slice(0, 10);
        const tipo = recent[0]?.tipo?.trim() || "Dividendo";
        results.push({
          ticker: ticker.toUpperCase(),
          date: dateStr,
          value: Math.round(avgValor * 100) / 100,
          type: tipo,
        });
      }
    } catch {
      continue;
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}
