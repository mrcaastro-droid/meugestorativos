import type { Asset, PortfolioSummary, DividendRecord, ContributionRecord, TradeRecord, Lot, FixedIncomeRecord } from "./types";
import { createSeedData } from "./seed";
import { detectAssetType } from "./detectType";

const STORAGE_KEY = "gestor-ativos-data";
const DIVIDEND_KEY = "gestor-ativos-dividendos";
const APORTE_KEY = "gestor-ativos-aportes";
const TRADE_KEY = "gestor-ativos-trades";

function generateId(): string {
  return crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadAssets(): Asset[] { return load<Asset>(STORAGE_KEY); }
function saveAssets(assets: Asset[]) { save(STORAGE_KEY, assets); }

const DATA_JSON_URL = "/data.json";

export async function initFromRemoteData(): Promise<boolean> {
  if (loadAssets().length > 0) return false;
  try {
    const res = await fetch(DATA_JSON_URL);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.assets && data.assets.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.assets));
    }
    if (data.dividends && data.dividends.length > 0) {
      localStorage.setItem(DIVIDEND_KEY, JSON.stringify(data.dividends));
    }
    if (data.contributions && data.contributions.length > 0) {
      localStorage.setItem(APORTE_KEY, JSON.stringify(data.contributions));
    }
    if (data.trades && data.trades.length > 0) {
      localStorage.setItem(TRADE_KEY, JSON.stringify(data.trades));
    }
    if (data.lots && data.lots.length > 0) {
      localStorage.setItem(LOT_KEY, JSON.stringify(data.lots));
    }
    return true;
  } catch {
    return false;
  }
}

export function exportAllData(): string {
  return JSON.stringify({
    assets: loadAssets(),
    dividends: load<DividendRecord>(DIVIDEND_KEY),
    contributions: load<ContributionRecord>(APORTE_KEY),
    trades: load<TradeRecord>(TRADE_KEY),
    lots: load<Lot>(LOT_KEY),
    fixedIncome: getFixedIncome(),
  }, null, 2);
}

export function getAssets(): Asset[] {
  return loadAssets();
}

export function addAsset(data: Omit<Asset, "id" | "createdAt" | "updatedAt">): Asset {
  const assets = loadAssets();
  const now = new Date().toISOString();
  const asset: Asset = { id: generateId(), ...data, createdAt: now, updatedAt: now };
  assets.push(asset);
  saveAssets(assets);
  return asset;
}

export function updateAsset(id: string, data: Partial<Asset>): Asset | null {
  const assets = loadAssets();
  const idx = assets.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  assets[idx] = { ...assets[idx], ...data, updatedAt: new Date().toISOString() };
  saveAssets(assets);
  return assets[idx];
}

export function deleteAsset(id: string): boolean {
  const assets = loadAssets().filter((a) => a.id !== id);
  saveAssets(assets);
  return true;
}

export function importAssets(assets: Omit<Asset, "id" | "createdAt" | "updatedAt">[]) {
  const existing = loadAssets();
  const now = new Date().toISOString();
  const merged = [
    ...existing,
    ...assets.map((a) => ({ ...a, id: generateId(), createdAt: now, updatedAt: now })),
  ];
  saveAssets(merged);
}

export function cleanupOrphanAssets(): number {
  const assets = loadAssets();
  const kept = assets.filter((a) => a.quantity > 0 || a.investedAmount > 0 || a.currentDividend > 0);
  saveAssets(kept);
  return assets.length - kept.length;
}

export function exportAssets(): Asset[] {
  return loadAssets();
}

// ---- Dividend Records ----

export function getDividends(): DividendRecord[] {
  return load<DividendRecord>(DIVIDEND_KEY);
}

export function addDividend(data: Omit<DividendRecord, "id" | "createdAt">): DividendRecord {
  const list = getDividends();
  const rec: DividendRecord = { id: generateId(), ...data, createdAt: new Date().toISOString() };
  list.push(rec);
  save(DIVIDEND_KEY, list);
  return rec;
}

export function deleteDividend(id: string): boolean {
  const list = getDividends().filter((d) => d.id !== id);
  save(DIVIDEND_KEY, list);
  return true;
}

export function importDividends(rows: Omit<DividendRecord, "id" | "createdAt">[]) {
  const existing = getDividends();
  const now = new Date().toISOString();
  const merged = [
    ...existing,
    ...rows.map((r) => ({ ...r, id: generateId(), createdAt: now })),
  ];
  save(DIVIDEND_KEY, merged);
}

export function exportDividends(): DividendRecord[] {
  return getDividends();
}

export function getDividendStats(dividends: DividendRecord[]) {
  const byMonth: Record<string, number> = {};
  const byTicker: Record<string, number> = {};
  let total = 0;
  dividends.forEach((d) => {
    const key = `${d.monthYear}`;
    byMonth[key] = (byMonth[key] ?? 0) + d.totalValue;
    byTicker[d.ticker] = (byTicker[d.ticker] ?? 0) + d.totalValue;
    total += d.totalValue;
  });
  return { byMonth, byTicker, total };
}

// ---- Contribution Records (Aportes) ----

export function getContributions(): ContributionRecord[] {
  return load<ContributionRecord>(APORTE_KEY);
}

export function addContribution(data: Omit<ContributionRecord, "id" | "createdAt">): ContributionRecord {
  const list = getContributions();
  const rec: ContributionRecord = { id: generateId(), ...data, createdAt: new Date().toISOString() };
  list.push(rec);
  save(APORTE_KEY, list);
  return rec;
}

export function deleteContribution(id: string): boolean {
  const list = getContributions().filter((c) => c.id !== id);
  save(APORTE_KEY, list);
  return true;
}

export function importContributions(rows: Omit<ContributionRecord, "id" | "createdAt">[]) {
  const existing = getContributions();
  const now = new Date().toISOString();
  const merged = [
    ...existing,
    ...rows.map((r) => ({ ...r, id: generateId(), createdAt: now })),
  ];
  save(APORTE_KEY, merged);
}

export function getContributionStats(contributions: ContributionRecord[]) {
  const byYear: Record<string, number> = {};
  let totalIn = 0;
  let totalOut = 0;
  contributions.forEach((c) => {
    const year = c.date.slice(0, 4);
    const v = c.value;
    if (v >= 0) {
      totalIn += v;
      byYear[year] = (byYear[year] ?? 0) + v;
    } else {
      totalOut += Math.abs(v);
    }
  });
  return { byYear, totalIn, totalOut, net: totalIn - totalOut };
}

// ---- Trade Records (Compra/Venda) ----

export function getTrades(): TradeRecord[] {
  return load<TradeRecord>(TRADE_KEY);
}

export function addTrade(data: Omit<TradeRecord, "id" | "createdAt">): TradeRecord {
  const list = getTrades();
  const rec: TradeRecord = { id: generateId(), ...data, createdAt: new Date().toISOString() };
  list.push(rec);
  save(TRADE_KEY, list);
  return rec;
}

export function deleteTrade(id: string): boolean {
  const list = getTrades().filter((t) => t.id !== id);
  save(TRADE_KEY, list);
  return true;
}

export function recalculateTrades(trades: TradeRecord[]): TradeRecord[] {
  const byTicker: Record<string, { shares: number; invested: number }> = {};
  return trades.map((t) => {
    const qty = t.quantity;
    const isBuy = qty > 0;
    const absQty = Math.abs(qty);
    const totalOp = absQty * t.price;
    const fees = 0; // user can edit later
    const irrf = isBuy ? 0 : totalOp * 0.0005; // 0.05% IRRF on sells
    const totalWithoutFees = totalOp;
    const totalWithFees = totalOp + fees;
    const priceWithFees = absQty > 0 ? totalWithFees / absQty : 0;

    const prev = byTicker[t.ticker] ?? { shares: 0, invested: 0 };

    let newShares: number;
    let newInvested: number;
    let avgPrice: number;

    if (isBuy) {
      newShares = prev.shares + absQty;
      newInvested = prev.invested + totalWithFees;
      avgPrice = newShares > 0 ? newInvested / newShares : 0;
    } else {
      if (prev.shares > 0) {
        const proportion = absQty / prev.shares;
        newInvested = prev.invested - prev.invested * proportion;
      } else {
        newInvested = 0;
      }
      newShares = Math.max(0, prev.shares - absQty);
      avgPrice = newShares > 0 ? newInvested / newShares : 0;
    }

    byTicker[t.ticker] = { shares: newShares, invested: newInvested };

    return {
      ...t,
      fees,
      irrf,
      totalWithoutFees,
      totalWithFees,
      priceWithFees,
      totalShares: newShares,
      avgPrice,
      operation: isBuy ? "COMPRA" : "VENDA",
    };
  });
}

export function recalculateAndSaveTrades(trades: TradeRecord[]) {
  save(TRADE_KEY, recalculateTrades(trades));
}

export function clearDividends() {
  localStorage.removeItem(DIVIDEND_KEY);
}

export function clearContributions() {
  localStorage.removeItem(APORTE_KEY);
}

export function importFullBackup(data: {
  assets?: Asset[];
  dividends?: DividendRecord[];
  contributions?: ContributionRecord[];
  trades?: TradeRecord[];
  fixedIncome?: FixedIncomeRecord[];
}) {
  if (data.assets) saveAssets(data.assets);
  if (data.dividends) save(DIVIDEND_KEY, data.dividends);
  if (data.contributions) save(APORTE_KEY, data.contributions);
  if (data.trades) save(TRADE_KEY, data.trades);
  if (data.fixedIncome) save(FIXED_INCOME_KEY, data.fixedIncome);
}

export function reclassifyAssets(): number {
  const assets = loadAssets();
  let changed = 0;
  const updated = assets.map((a) => {
    const info = detectAssetType(a.ticker);
    if (a.type !== info.type) {
      changed++;
      return { ...a, type: info.type, sector: info.sector, updatedAt: new Date().toISOString() };
    }
    return a;
  });
  saveAssets(updated);
  return changed;
}

export function importSeedData() {
  const seed = createSeedData();
  const now = new Date().toISOString();
  const assets = seed.map((a: any) => ({ ...a, id: generateId(), createdAt: now, updatedAt: now }));
  saveAssets(assets);
  
  // Não criar dividendos falsos - apenas carregar dados reais via API
  // A busca automática preencherá os preços e dividends com dados verdadeiros
}

// ---- Lot Tracking ----

const LOT_KEY = "gestor-ativos-lotes";

export function clearTrades() {
  localStorage.removeItem(TRADE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOT_KEY);
  localStorage.removeItem(DIVIDEND_KEY);
  localStorage.removeItem(APORTE_KEY);
  localStorage.removeItem("gestor-last-price-update");
}

export function getLots(): Lot[] {
  return load<Lot>(LOT_KEY);
}

export function addLot(data: Omit<Lot, "id" | "createdAt">): Lot {
  const list = getLots();
  const lot: Lot = { id: generateId(), ...data, createdAt: new Date().toISOString() };
  list.push(lot);
  save(LOT_KEY, list);
  return lot;
}

export function consumeLots(ticker: string, quantity: number): number {
  // FIFO: consume oldest lots first, return the cost basis (total invested of consumed shares)
  const lots = getLots()
    .filter((l) => l.ticker.toUpperCase() === ticker.toUpperCase() && l.remaining > 0)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  let remaining = quantity;
  let totalInvested = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const consume = Math.min(lot.remaining, remaining);
    totalInvested += (lot.price + lot.fees / lot.quantity) * consume;
    remaining -= consume;
    lot.remaining -= consume;
  }

  save(LOT_KEY, lots);
  return totalInvested;
}

export function getRemainingLots(ticker: string): Lot[] {
  return getLots()
    .filter((l) => l.ticker.toUpperCase() === ticker.toUpperCase() && l.remaining > 0)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

export function importLots(lots: Omit<Lot, "id" | "createdAt">[]) {
  const existing = getLots();
  const now = new Date().toISOString();
  const merged = [...existing, ...lots.map((l) => ({ ...l, id: generateId(), createdAt: now }))];
  save(LOT_KEY, merged);
}

export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DIVIDEND_KEY);
  localStorage.removeItem(APORTE_KEY);
  localStorage.removeItem(TRADE_KEY);
  localStorage.removeItem(LOT_KEY);
  localStorage.removeItem(FIXED_INCOME_KEY);
  localStorage.removeItem("gestor-last-price-update");
}

// ---- Fixed Income (CDB, LCI, LCA) ----

const FIXED_INCOME_KEY = "gestor-ativos-renda-fixa";

export function getFixedIncome(): FixedIncomeRecord[] {
  return load<FixedIncomeRecord>(FIXED_INCOME_KEY);
}

export function addFixedIncome(data: Omit<FixedIncomeRecord, "id" | "createdAt" | "updatedAt">): FixedIncomeRecord {
  const list = getFixedIncome();
  const now = new Date().toISOString();
  const rec: FixedIncomeRecord = { id: generateId(), ...data, createdAt: now, updatedAt: now };
  list.push(rec);
  save(FIXED_INCOME_KEY, list);
  return rec;
}

export function updateFixedIncome(id: string, data: Partial<FixedIncomeRecord>): FixedIncomeRecord | null {
  const list = getFixedIncome();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
  save(FIXED_INCOME_KEY, list);
  return list[idx];
}

export function deleteFixedIncome(id: string): boolean {
  const list = getFixedIncome().filter((r) => r.id !== id);
  save(FIXED_INCOME_KEY, list);
  return true;
}

export function getFixedIncomeSummary(records: FixedIncomeRecord[]) {
  const totalInvested = records.reduce((s, r) => s + r.investedAmount, 0);
  const totalCurrentValue = records.reduce((s, r) => s + r.currentValue, 0);
  const totalReturn = totalCurrentValue - totalInvested;
  const returnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  const byType: Record<string, number> = {};
  const byInstitution: Record<string, number> = {};
  records.forEach((r) => {
    byType[r.type] = (byType[r.type] ?? 0) + r.currentValue;
    byInstitution[r.institution] = (byInstitution[r.institution] ?? 0) + r.currentValue;
  });

  return { totalInvested, totalCurrentValue, totalReturn, returnPct, byType, byInstitution };
}

export function resetAndReseedData() {
  // Limpar tudo
  clearAll();
  
  // Importar seed novo
  importSeedData();
  
  // Tentar atualizar preços via API (com fallback automático para dados padrão)
  return new Promise<void>((resolve) => {
    import('./prices').then(async ({ updatePrices }) => {
      const assets = getAssets();
      await updatePrices(
        assets.map(a => ({ id: a.id, ticker: a.ticker })),
        () => {}
      );
      resolve();
    });
  });
}

export function calculateSummary(assets: Asset[], dividends?: DividendRecord[]): PortfolioSummary {
  const totalInvested = assets.reduce((s, a) => s + a.investedAmount, 0);
  const totalCurrentValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);

  // Média mensal por ticker dos últimos 12 registros de cada ticker
  const assetDivMap: Record<string, number> = {};
  if (dividends && dividends.length > 0) {
    const byTicker: Record<string, DividendRecord[]> = {};
    for (const d of dividends) {
      const key = d.ticker.toUpperCase();
      if (!byTicker[key]) byTicker[key] = [];
      byTicker[key].push(d);
    }
    for (const [ticker, records] of Object.entries(byTicker)) {
      const sorted = [...records].sort((a, b) => b.payment.localeCompare(a.payment));
      const last12 = sorted.slice(0, 12);
      const byMonth: Record<string, number> = {};
      for (const d of last12) {
        byMonth[d.monthYear] = (byMonth[d.monthYear] ?? 0) + d.totalValue;
      }
      const vals = Object.values(byMonth);
      if (vals.length > 0) {
        assetDivMap[ticker] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    }
  }

  const monthlyDividend = assets.reduce((s, a) => {
    const fromRecords = assetDivMap[a.ticker.toUpperCase()];
    if (fromRecords !== undefined && fromRecords > 0) return s + fromRecords;
    const divPerShare = a.dividendPerShare || 0;
    return s + (divPerShare > 0 ? divPerShare * a.quantity : a.currentDividend);
  }, 0);

  const annualDividend = monthlyDividend * 12;

  const projectedMonthlyDividend = assets.reduce((s, a) => {
    const fromRecords = assetDivMap[a.ticker.toUpperCase()] ?? 0;
    if (fromRecords > 0) return s + fromRecords;
    const divPerShare = a.dividendPerShare || 0;
    if (divPerShare <= 0) return s + a.currentDividend;
    if (a.targetTotal > 0 && a.avgPrice > 0) {
      const projectedShares = a.targetTotal / a.avgPrice;
      return s + projectedShares * divPerShare;
    }
    return s + divPerShare * a.quantity;
  }, 0);

  const types: Record<string, number> = {};
  const sectors: Record<string, number> = {};
  assets.forEach((a) => {
    types[a.type] = (types[a.type] ?? 0) + a.investedAmount;
    if (a.sector) sectors[a.sector] = (sectors[a.sector] ?? 0) + a.investedAmount;
  });

  return {
    totalInvested,
    totalCurrentValue,
    monthlyDividend,
    annualDividend,
    projectedMonthlyDividend,
    projectedAnnualDividend: projectedMonthlyDividend * 12,
    assetCount: assets.length,
    types,
    sectors,
  };
}
