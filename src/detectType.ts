const KNOWN_ETFS = new Set([
  "IVVB11", "BOVA11", "BRAX11", "SMAL11", "DIVO11", "SPXI11",
  "FIND11", "ECOO11", "GOLD11", "HASH11", "NASD11", "QBTC11",
  "QETH11", "USDB11", "WRLD11", "XINA11", "NSDV11", "PIBB11",
  "MATB11", "JSIA11", "ACWI11", "BITH11", "AREC11", "TREV11",
  "URAN11", "XPS11", "BOGA11", "G2IS11", "CLIM11", "CMDB11",
  "CRPT11", "DIVD11", "ECOR11", "ENIA11", "ESGB11", "FIXA11",
  "FLAG11", "GOVE11", "GRID11", "HSAF11", "IFRA11", "ISUS11",
  "JBRA11", "JEQP11", "JPCA11", "MACA11", "MDIA11", "MILA11",
  "MODA11", "PSSB11", "REND11", "ROOM11", "SINA11", "STEM11",
  "SUST11", "TECB11", "TEND11", "TRIG11", "VALU11", "VEGA11",
  "VOLT11", "WEGE11", "WHAT11",
]);

// Units on B3: tickers ending with 11 that represent equity units (not FIIs)
const KNOWN_UNITS = new Set([
  "TAEE11", "SANB11", "BRSR11", "KLBN11",
]);

export function detectAssetType(ticker: string): { type: string; sector: string } {
  const u = ticker.toUpperCase().trim();

  if (KNOWN_ETFS.has(u)) return { type: "ETF", sector: "ETF" };

  if (KNOWN_UNITS.has(u)) return { type: "AÇÃO", sector: "A DEFINIR" };

  if (u.endsWith("34") || u.endsWith("35") || u.endsWith("30") || u.endsWith("31") || u.endsWith("32") || u.endsWith("33"))
    return { type: "BDR", sector: "BDR" };

  if (u.endsWith("11")) return { type: "FII", sector: "A DEFINIR" };

  if (u.endsWith("3") || u.endsWith("4") || u.endsWith("5") || u.endsWith("6"))
    return { type: "AÇÃO", sector: "A DEFINIR" };

  return { type: "ETF", sector: "ETF" };
}

export function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    FII: "#10b981",
    AÇÃO: "#3b82f6",
    ETF: "#f59e0b",
    BDR: "#8b5cf6",
    TESOURO: "#14b8a6",
    CDB: "#f97316",
    LCI: "#ec4899",
    LCA: "#ef4444",
  };
  return map[type.toUpperCase()] ?? "#6b7280";
}
