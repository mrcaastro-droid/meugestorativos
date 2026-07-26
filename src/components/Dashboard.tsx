import { useMemo, useState } from "react";
import type { Asset, PortfolioSummary, ContributionRecord, TradeRecord, DividendRecord, FixedIncomeRecord } from "../types";
import { formatCurrency, formatCompact, formatPercent } from "../format";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { AssetLogo } from "./AssetLogo";

interface Props {
  summary: PortfolioSummary;
  assets: Asset[];
  hideValues: boolean;
  contributions: ContributionRecord[];
  trades: TradeRecord[];
  dividends?: DividendRecord[];
  fixedIncome?: FixedIncomeRecord[];
}

function mask(v: number, hidden: boolean) {
  return hidden ? "R$ ••••" : formatCurrency(v);
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const borderAccents: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  purple: "border-l-purple-500",
};

const tooltipContentStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 12,
  fontSize: 13,
};

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    FII: "#10b981",
    Ação: "#3b82f6",
    ETF: "#f59e0b",
    BDR: "#8b5cf6",
    Tesouro: "#14b8a6",
    CDB: "#f97316",
    LCI: "#ec4899",
    LCA: "#ef4444",
  };
  return map[type] ?? "#6b7280";
}

export function Dashboard({ summary, assets, hideValues, contributions, trades, dividends, fixedIncome = [] }: Props) {
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [selectedFIISegment, setSelectedFIISegment] = useState<string | null>(null);

  const fixedIncomeTotal = useMemo(() => {
    return fixedIncome.reduce((s, r) => s + r.currentValue, 0);
  }, [fixedIncome]);

  const fixedIncomeInvested = useMemo(() => {
    return fixedIncome.reduce((s, r) => s + r.investedAmount, 0);
  }, [fixedIncome]);

  const totalPatrimony = summary.totalCurrentValue + fixedIncomeTotal;
  const totalInvested = summary.totalInvested + fixedIncomeInvested;

  const typeData = Object.entries(summary.types)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  const { fiiSectorData, otherSectorData, fiiAssetsBySegment, otherAssetsBySegment } = useMemo(() => {
    const fiiSectors: Record<string, number> = {};
    const otherSectors: Record<string, number> = {};
    const fiiMap: Record<string, Asset[]> = {};
    const otherMap: Record<string, Asset[]> = {};

    for (const a of assets) {
      const seg = a.sector || "A DEFINIR";
      const isFII = a.type === "FII";
      const target = isFII ? fiiSectors : otherSectors;
      const map = isFII ? fiiMap : otherMap;
      target[seg] = (target[seg] ?? 0) + a.investedAmount;
      if (!map[seg]) map[seg] = [];
      map[seg].push(a);
    }

    function buildData(sectors: Record<string, number>) {
      const total = Object.values(sectors).reduce((s, v) => s + v, 0);
      const sorted = Object.entries(sectors)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value);
      const threshold = total * 0.03;
      const main: typeof sorted = [];
      let otherValue = 0;
      for (const item of sorted) {
        if (item.value >= threshold) main.push(item);
        else otherValue += item.value;
      }
      if (otherValue > 0) main.push({ name: "Outros", value: otherValue });
      return main;
    }

    return {
      fiiSectorData: buildData(fiiSectors),
      otherSectorData: buildData(otherSectors),
      fiiAssetsBySegment: fiiMap,
      otherAssetsBySegment: otherMap,
    };
  }, [assets]);

  const totalFIISector = fiiSectorData.reduce((s, d) => s + d.value, 0);
  const totalOtherSector = otherSectorData.reduce((s, d) => s + d.value, 0);

  const dividendBreakdown = useMemo(() => {
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
    return assets
      .filter(a => {
        const fromRecords = assetDivMap[a.ticker.toUpperCase()] ?? 0;
        return fromRecords > 0 || a.dividendPerShare > 0 || a.currentDividend > 0;
      })
      .map(a => {
        const fromRecords = assetDivMap[a.ticker.toUpperCase()] ?? 0;
        if (fromRecords > 0) return { ...a, monthlyDiv: fromRecords, annualDiv: fromRecords * 12 };
        const raw = a.dividendPerShare > 0 ? a.dividendPerShare * a.quantity : a.currentDividend;
        return { ...a, monthlyDiv: raw, annualDiv: raw * 12 };
      })
      .sort((a, b) => b.annualDiv - a.annualDiv);
  }, [assets, dividends]);

  const topAssets = [...assets]
    .sort((a, b) => b.currentDividend - a.currentDividend)
    .slice(0, 6);

  const maxDividend = topAssets.length > 0 ? topAssets[0].currentDividend : 0;

  const realInvested = totalInvested;
  const diff = totalPatrimony - realInvested;
  const rentPct = realInvested > 0 ? (diff / realInvested) * 100 : 0;

  const { netWorthData, cumulativeAportes } = useMemo(() => {
    const dates = new Map<string, { aportado: number; patrimonio: number }>();
    const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
    let cumulativeAportes = 0;

    for (const c of sorted) {
      cumulativeAportes += c.value;
      dates.set(c.date, { aportado: cumulativeAportes, patrimonio: cumulativeAportes });
    }

    if (dates.size > 0) {
      const today = new Date().toISOString().slice(0, 10);
      if (!dates.has(today)) {
        dates.set(today, {
          aportado: cumulativeAportes,
          patrimonio: totalPatrimony || cumulativeAportes,
        });
      } else {
        const lastEntry = Array.from(dates.entries()).pop()!;
        dates.set(lastEntry[0], {
          ...lastEntry[1],
          patrimonio: totalPatrimony || cumulativeAportes,
        });
      }
    }

    const data = Array.from(dates.entries()).map(([date, d]) => ({
      date: date.slice(0, 7),
      Aportado: Math.round(d.aportado),
      Patrimônio: Math.round(d.patrimonio),
    }));

    return { netWorthData: data, cumulativeAportes };
  }, [contributions, totalPatrimony]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Total Investido" value={mask(realInvested, hideValues)} accent="blue" />
        <SummaryCard label="Dividendo Mensal" value={mask(summary.monthlyDividend, hideValues)} accent="green" />
        <SummaryCard label="Dividendo Anual" value={mask(summary.annualDividend, hideValues)} accent="green" />
        <SummaryCard label="Carteira" value={String(summary.assetCount + fixedIncome.length)} accent="purple" />
        <div className="bg-card border border-border rounded-2xl p-4 border-l-2 border-l-amber-500">
          <p className="text-xs text-muted mb-1">Patrimônio Atual</p>
          <p className="text-lg font-bold tabular">{mask(totalPatrimony, hideValues)}</p>
          <p className="text-xs text-muted mt-0.5">(investido: {mask(realInvested, hideValues)})</p>
        </div>
      </div>

      {dividendBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-semibold text-sm mb-3">Detalhamento do Dividendo Anual</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {dividendBreakdown.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                <AssetLogo ticker={a.ticker} size={20} />
                <span className="font-medium w-16">{a.ticker}</span>
                <span className="text-muted w-10">{a.type}</span>
                <span className="text-muted flex-1">{a.ticker} • {a.quantity} cotas</span>
                <span className="tabular w-20 text-right">{formatCurrency(a.monthlyDiv)}/mês</span>
                <span className="font-medium tabular w-20 text-right">{formatCurrency(a.annualDiv)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs font-semibold mt-3 pt-2 border-t border-border">
            <span>Total/mês</span>
            <span className="tabular">{formatCurrency(dividendBreakdown.reduce((s, a) => s + a.monthlyDiv, 0))}</span>
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span>Total/ano</span>
            <span className="tabular">{formatCurrency(dividendBreakdown.reduce((s, a) => s + a.annualDiv, 0))}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Alocação por Tipo</h3>
          {typeData.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">Nenhum ativo cadastrado</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {typeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {typeData.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted flex-1">{t.name}</span>
                <span className="font-medium">{formatCompact(t.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Dividendos por Ativo</h3>
          {topAssets.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">Nenhum dividendo sendo recebido</p>
          ) : (
            <div className="space-y-3">
              {topAssets.map((a) => {
                const barPct = maxDividend > 0 ? (a.currentDividend / maxDividend) * 100 : 0;
                const avatarColor = getTypeColor(a.type);
                return (
                  <div key={a.id}>
                    <div className="flex items-center gap-3 mb-1">
                      <AssetLogo ticker={a.ticker} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.ticker}</p>
                        <p className="text-xs text-muted">{a.type} • {a.quantity} cotas</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">{mask(a.currentDividend, hideValues)}</p>
                        <p className="text-xs text-muted tabular">mês</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${barPct}%`, backgroundColor: avatarColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MiniCard label="Dividendo Projetado/Mês" value={mask(summary.projectedMonthlyDividend, hideValues)} />
        <MiniCard label="Dividendo Projetado/Ano" value={mask(summary.projectedAnnualDividend, hideValues)} />
        <MiniCard
          label="Rentabilidade Média"
          value={realInvested > 0 ? formatPercent(rentPct) : "0%"}
          valueClassName={diff >= 0 ? "text-emerald-500" : "text-red-500"}
          subValue={realInvested > 0 ? `${diff >= 0 ? "+" : ""}${mask(diff, hideValues)}` : undefined}
        />
      </div>

      {fiiSectorData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Fundos Imobiliários por Segmento</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fiiSectorData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    onClick={(_, index) => {
                      const seg = fiiSectorData[index]?.name;
                      setSelectedFIISegment(prev => prev === seg ? null : seg);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {fiiSectorData.map((s, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        opacity={selectedFIISegment === null || selectedFIISegment === s.name ? 1 : 0.3}
                        stroke={selectedFIISegment === s.name ? "#fff" : undefined}
                        strokeWidth={selectedFIISegment === s.name ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {fiiSectorData.map((s, i) => {
                const pct = (s.value / totalFIISector) * 100;
                const isSelected = selectedFIISegment === s.name;
                const segAssets = fiiAssetsBySegment[s.name] || [];
                return (
                  <div key={s.name}>
                    <button
                      className={`w-full text-left rounded-lg p-2 transition-all ${isSelected ? "bg-surface ring-1 ring-border" : "hover:bg-surface/50"}`}
                      onClick={() => setSelectedFIISegment(prev => prev === s.name ? null : s.name)}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-muted">{s.name}</span>
                          {s.name === "A DEFINIR" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                              {segAssets.length} ativo{segAssets.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <span className="font-medium">{formatCompact(s.value)}</span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </button>
                    {isSelected && segAssets.length > 0 && (
                      <div className="mt-1 ml-4 space-y-1 border-l-2 border-border pl-3">
                        {segAssets.map(a => (
                          <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                            <AssetLogo ticker={a.ticker} size={20} />
                            <span className="font-medium">{a.ticker}</span>
                            <span className="text-muted">{a.type}</span>
                            <span className="ml-auto tabular">{formatCompact(a.currentPrice * a.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {otherSectorData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Outros Ativos por Segmento</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={otherSectorData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    onClick={(_, index) => {
                      const seg = otherSectorData[index]?.name;
                      setSelectedSegment(prev => prev === seg ? null : seg);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {otherSectorData.map((s, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        opacity={selectedSegment === null || selectedSegment === s.name ? 1 : 0.3}
                        stroke={selectedSegment === s.name ? "#fff" : undefined}
                        strokeWidth={selectedSegment === s.name ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {otherSectorData.map((s, i) => {
                const pct = (s.value / totalOtherSector) * 100;
                const isSelected = selectedSegment === s.name;
                const segAssets = otherAssetsBySegment[s.name] || [];
                return (
                  <div key={s.name}>
                    <button
                      className={`w-full text-left rounded-lg p-2 transition-all ${isSelected ? "bg-surface ring-1 ring-border" : "hover:bg-surface/50"}`}
                      onClick={() => setSelectedSegment(prev => prev === s.name ? null : s.name)}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-muted">{s.name}</span>
                          {s.name === "A DEFINIR" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                              {segAssets.length} ativo{segAssets.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <span className="font-medium">{formatCompact(s.value)}</span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </button>
                    {isSelected && segAssets.length > 0 && (
                      <div className="mt-1 ml-4 space-y-1 border-l-2 border-border pl-3">
                        {segAssets.map(a => (
                          <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                            <AssetLogo ticker={a.ticker} size={20} />
                            <span className="font-medium">{a.ticker}</span>
                            <span className="text-muted">{a.type}</span>
                            <span className="ml-auto tabular">{formatCompact(a.currentPrice * a.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "blue" | "green" | "purple";
}) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-4 border-l-2 ${borderAccents[accent]}`}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-lg font-bold tabular">{value}</p>
    </div>
  );
}

function MiniCard({
  label,
  value,
  valueClassName = "text-primary",
  subValue,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  subValue?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-base font-bold tabular ${valueClassName}`}>{value}</p>
      {subValue && <p className="text-xs text-muted mt-0.5">{subValue}</p>}
    </div>
  );
}
