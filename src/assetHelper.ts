import { getAssets, updateAsset, addAsset, deleteAsset, getTrades } from "./store";
import type { Asset } from "./types";
import { detectAssetType } from "./detectType";
import { getKnownSector } from "./sectorFetch";

export function syncAssetsFromTrades(): void {
  const trades = getTrades();

  const sorted = [...trades].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const aIsBuy = a.quantity > 0 ? 0 : 1;
    const bIsBuy = b.quantity > 0 ? 0 : 1;
    if (aIsBuy !== bIsBuy) return aIsBuy - bIsBuy;
    return a.id.localeCompare(b.id);
  });

  // Calculate running position per ticker from all trades (no side effects)
  const byTicker: Record<string, { shares: number; invested: number; avgCost: number }> = {};
  for (const t of sorted) {
    const qty = t.quantity;
    const isBuy = qty > 0;
    const absQty = Math.abs(qty);
    const totalOp = absQty * t.price + t.fees;
    const prev = byTicker[t.ticker] ?? { shares: 0, invested: 0, avgCost: 0 };

    if (isBuy) {
      const newShares = prev.shares + absQty;
      const newInvested = prev.invested + totalOp;
      byTicker[t.ticker] = { shares: newShares, invested: newInvested, avgCost: newShares > 0 ? newInvested / newShares : 0 };
    } else {
      const newShares = Math.max(0, prev.shares - absQty);
      const costBasis = prev.avgCost * absQty;
      const newInvested = Math.max(0, prev.invested - costBasis);
      byTicker[t.ticker] = { shares: newShares, invested: newInvested, avgCost: newShares > 0 ? newInvested / newShares : 0 };
    }
  }

  // Remove assets that have zero shares AND no current dividend (truly orphaned)
  const existing = getAssets();
  const tickersWithTrades = new Set(trades.map((t) => t.ticker.toUpperCase()));

  for (const a of existing) {
    const pos = byTicker[a.ticker.toUpperCase()];
    if (pos && pos.shares > 0) {
      // Update existing asset from trade data
      const avgPrice = +((pos.invested / pos.shares).toFixed(2));
      const info = detectAssetType(a.ticker);
      const sector = (a.sector && a.sector !== "A DEFINIR") ? a.sector : (getKnownSector(a.ticker) || info.sector);
      const newDividend = pos.shares * (a.dividendPerShare || 0);
      const investedAmount = +pos.invested.toFixed(2);
      const patch: Record<string, any> = {
        type: info.type,
        sector,
        quantity: pos.shares,
        currentDividend: newDividend > 0 ? newDividend : a.currentDividend,
        annualReturn: pos.shares * (a.dividendPerShare || 0) * 12,
      };
      if (!a.manualInvested || a.investedAmount === 0) {
        patch.avgPrice = avgPrice;
        patch.investedAmount = investedAmount;
      }
      updateAsset(a.id, patch);
    } else if (pos && pos.shares <= 0) {
      // Sold all shares - update quantity to 0 and reset invested
      updateAsset(a.id, { quantity: 0, investedAmount: 0, currentDividend: 0, annualReturn: 0 });
    }
    // Keep assets that have no trades at all (manually added)
  }

  // Create assets only for tickers with shares > 0 that don't exist yet
  const existingTickers = new Set(getAssets().map((a) => a.ticker.toUpperCase()));
  for (const [ticker, pos] of Object.entries(byTicker)) {
    if (pos.shares <= 0) continue;
    if (existingTickers.has(ticker.toUpperCase())) continue;

    const info = detectAssetType(ticker);
    const avgPrice = +((pos.invested / pos.shares).toFixed(2));
    const sector = getKnownSector(ticker) || info.sector;

    const asset: Omit<Asset, "id" | "createdAt" | "updatedAt"> = {
      ticker: ticker.toUpperCase(),
      type: info.type,
      subtype: "",
      sector,
      paymentDay: info.type === "FII" ? 14 : null,
      currentPrice: avgPrice,
      dividendPerShare: 0,
      dividendYield: 0,
      targetTotal: 0,
      sharesNeeded: 0,
      avgPrice,
      quantity: pos.shares,
      goal: "PAUSAR",
      investedAmount: +pos.invested.toFixed(2),
      missing: 0,
      currentDividend: 0,
      annualReturn: 0,
      magicMonth: 0,
      magicNumber: avgPrice,
      divYield12m: null,
      representation: 0,
      percentInPortfolio: 0,
      status: "",
    };
    addAsset(asset);
  }
}
