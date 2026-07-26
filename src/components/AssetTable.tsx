import type { Asset, FixedIncomeRecord } from "../types";
import { formatCurrency, formatPercent, formatDate } from "../format";
import { deleteAsset, deleteFixedIncome, getDividends, getTrades, getFixedIncomeSummary } from "../store";
import { Pencil, Trash2, ChevronDown, ChevronUp, RefreshCw, Layers, Landmark } from "lucide-react";
import { useState, useEffect, useMemo, Fragment } from "react";
import { PriceUpdateDialog } from "./PriceUpdateDialog";
import { AssetLogo } from "./AssetLogo";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { LotsView } from "./LotsView";
import { fetchDY12m } from "../prices";

interface Props {
  assets: Asset[];
  fixedIncome: FixedIncomeRecord[];
  hideValues: boolean;
  onEdit: (asset: Asset) => void;
  onEditFixedIncome: (record: FixedIncomeRecord) => void;
  onRefresh: () => void;
}

function mask(v: number, hidden: boolean) {
  return hidden ? "R$ ••••" : formatCurrency(v);
}

function getIRRate(days: number): number {
  if (days <= 180) return 22.5;
  if (days <= 360) return 20;
  if (days <= 720) return 17.5;
  return 15;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

const TYPE_COLORS: Record<string, string> = {
  CDB: "bg-[#f97316]/10 text-[#f97316]",
  LCI: "bg-[#ec4899]/10 text-[#ec4899]",
  LCA: "bg-[#ef4444]/10 text-[#ef4444]",
};

export function AssetTable({ assets, fixedIncome, hideValues, onEdit, onEditFixedIncome, onRefresh }: Props) {
  const [sortField, setSortField] = useState<string>("currentDividend");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [lotAsset, setLotAsset] = useState<Asset | null>(null);
  const [dyMap, setDyMap] = useState<Map<string, number>>(new Map());
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const allDividends = getDividends();

  const typeCards = [
    { type: "AÇÃO", label: "Ações", color: "#3b82f6" },
    { type: "FII", label: "Fundos Imobiliários", color: "#10b981" },
    { type: "ETF", label: "ETFs", color: "#f59e0b" },
    { type: "RENDA_FIXA", label: "Renda Fixa", color: "#f97316", types: ["CDB", "LCI", "LCA"] },
  ];

  const totalInvested = assets.reduce((s, a) => s + a.investedAmount, 0) + fixedIncome.reduce((s, r) => s + r.investedAmount, 0);

  const typeData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of assets) {
      map[a.type] = (map[a.type] ?? 0) + a.investedAmount;
    }
    // Add fixed income data
    const fiInvested = fixedIncome.reduce((s, r) => s + r.investedAmount, 0);
    map["RENDA_FIXA"] = fiInvested;
    return map;
  }, [assets, fixedIncome]);

  const currentValueByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of assets) {
      map[a.type] = (map[a.type] ?? 0) + a.currentPrice * a.quantity;
    }
    // Add fixed income data
    const fiCurrent = fixedIncome.reduce((s, r) => s + r.currentValue, 0);
    map["RENDA_FIXA"] = fiCurrent;
    return map;
  }, [assets, fixedIncome]);

  useEffect(() => {
    const tickers = assets.map((a) => a.ticker);
    if (tickers.length === 0) return;
    fetchDY12m(tickers).then((map) => {
      const dy = new Map<string, number>();
      const pr = new Map<string, number>();
      for (const [t, v] of map) {
        dy.set(t, v.dy12m);
        pr.set(t, v.price);
      }
      setDyMap(dy);
      setPriceMap(pr);
    });
  }, [assets]);

  const filtered = useMemo(() => {
    let result = assets.filter(a => a.quantity > 0 || a.investedAmount > 0);
    if (typeFilter) {
      const card = typeCards.find(c => c.type === typeFilter);
      if (card && card.types) {
        result = result.filter(a => card.types.includes(a.type));
      } else {
        result = result.filter(a => a.type === typeFilter);
      }
    }
    return result;
  }, [assets, typeFilter]);

  const sorted = [...filtered].sort((a, b) => {
    let av: number, bv: number;
    if (sortField === "gainLoss") {
      av = a.currentPrice * a.quantity - a.investedAmount;
      bv = b.currentPrice * b.quantity - b.investedAmount;
    } else {
      av = (a as any)[sortField] ?? 0;
      bv = (b as any)[sortField] ?? 0;
    }
    return sortAsc ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
  });

  function toggleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  function SortHeader({ field, label, className }: { field: string; label: string; className?: string }) {
    const active = sortField === field;
    return (
      <button onClick={() => toggleSort(field)} className={`flex items-center gap-1 transition-colors whitespace-nowrap ${active ? "text-primary" : "hover:text-foreground"} ${className}`}>
        <span className="text-xs font-medium">{label}</span>
        {active && (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
        {!active && <ChevronUp className="size-3 text-transparent" />}
      </button>
    );
  }

  async function handleDelete(id: string, ticker: string) {
    if (confirm(`Excluir ${ticker}?`)) {
      deleteAsset(id);
      onRefresh();
    }
  }

  function yieldColor(pct: number) {
    if (pct > 1) return "text-green-500";
    if (pct > 0.5) return "text-yellow-500";
    return "text-red-500";
  }

  if (assets.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <p className="text-muted mb-2">Nenhum ativo cadastrado</p>
        <p className="text-sm text-muted">Clique em "Novo Ativo" para começar</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {typeCards.map((tc) => {
          const invested = typeData[tc.type] ?? 0;
          const currentValue = currentValueByType[tc.type] ?? 0;
          const gainLoss = currentValue - invested;
          const pct = totalInvested > 0 ? (invested / totalInvested) * 100 : 0;
          const isActive = typeFilter === tc.type;
          const circumference = 2 * Math.PI * 18;
          const dashoffset = circumference - (pct / 100) * circumference;
          return (
            <button
              key={tc.type}
              onClick={() => setTypeFilter(isActive ? null : tc.type)}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                isActive
                  ? "bg-surface border-primary/50 ring-1 ring-primary/30"
                  : "bg-card border-border hover:border-border/80"
              }`}
            >
              <div className="relative size-12 shrink-0">
                <svg className="size-12 -rotate-90" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-surface" />
                  <circle
                    cx="20" cy="20" r="18" fill="none"
                    stroke={tc.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashoffset}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular">
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm">{tc.label}</p>
                <p className="text-xs text-muted">Valor Aplicado</p>
                <p className="text-sm font-medium tabular">{mask(invested, hideValues)}</p>
                <p className="text-xs text-muted mt-1">Resultado Total</p>
                <p className={`text-sm font-medium tabular ${gainLoss >= 0 ? "text-income" : "text-expense"}`}>{mask(currentValue, hideValues)}</p>
              </div>
              <ChevronDown className={`size-4 text-muted transition-transform ${isActive ? "rotate-180" : ""}`} />
            </button>
          );
        })}
      </div>

      {typeFilter === "RENDA_FIXA" ? (
        <FixedIncomeSection records={fixedIncome} hideValues={hideValues} onRefresh={onRefresh} onEdit={onEditFixedIncome} />
      ) : (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <p className="text-xs text-muted font-medium uppercase tracking-wider">
            {typeFilter ? `${typeFilter}s — ` : ""}{filtered.length} ativos
          </p>
          <button
            onClick={() => setPriceOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-muted hover:text-foreground text-xs transition-colors"
            title="Atualizar cotações ao vivo"
          >
            <RefreshCw className="size-3.5" /> Atualizar Preços
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left"><SortHeader field="ticker" label="Ativo" /></th>
                <th className="p-3 text-left hidden sm:table-cell"><SortHeader field="type" label="Tipo" /></th>
                <th className="p-3 text-right"><SortHeader field="currentPrice" label="Cotação" /></th>
                <th className="p-3 text-right"><SortHeader field="quantity" label="Qtd" /></th>
                <th className="p-3 text-right hidden md:table-cell"><SortHeader field="investedAmount" label="Investido" /></th>
                <th className="p-3 text-right hidden md:table-cell"><span className="text-xs font-medium">Posição</span></th>
                <th className="p-3 text-right hidden md:table-cell"><SortHeader field="gainLoss" label="Ganho/Perda" /></th>
                <th className="p-3 text-right hidden lg:table-cell"><span className="text-xs font-medium">Preço Médio</span></th>
                <th className="p-3 text-right hidden lg:table-cell"><span className="text-xs font-medium">Preço Justo</span></th>
                <th className="p-3 text-right"><span className="text-xs font-medium">DY Anual<br/><span className="text-[10px] text-muted font-normal">(com JCP)</span></span></th>
                <th className="p-3 text-right w-20" />
              </tr>
            </thead>
            {sorted.map((a) => {
              const isExpanded = expanded === a.id;
              const currentValue = a.currentPrice * a.quantity;
              const valueColor = currentValue >= a.investedAmount ? "text-income" : "text-expense";
              // DY Anual: apenas Yahoo API
              const dyAnual = dyMap.get(a.ticker.toUpperCase()) || 0;
              // Preço Justo: preço do Yahoo × (DY alvo ÷ DY real)
              const precoJusto = dyAnual > 0 && a.currentPrice > 0
                ? a.currentPrice * (8 / dyAnual)
                : 0;
              return (
                <tbody key={a.id} className="even:bg-surface/30">
                  <tr
                    className="hover:bg-card-hover transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : a.id)}
                    onDoubleClick={() => setDetailAsset(a)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <AssetLogo ticker={a.ticker} />
                        <div>
                          <p className="font-semibold text-sm">{a.ticker}</p>
                          <p className="text-xs text-muted">{a.sector || a.subtype || a.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <span className="text-xs bg-surface px-2 py-1 rounded-lg">{a.type}</span>
                    </td>
                    <td className="p-3 text-right tabular font-medium">{mask(a.currentPrice, hideValues)}</td>
                    <td className="p-3 text-right tabular">{a.quantity}</td>
                    <td className="p-3 text-right tabular hidden md:table-cell">{mask(a.investedAmount, hideValues)}</td>
                    <td className="p-3 text-right tabular hidden md:table-cell font-medium">{mask(currentValue, hideValues)}</td>
                    <td className="p-3 text-right tabular hidden md:table-cell">
                      <p className={`font-medium ${currentValue >= a.investedAmount ? "text-income" : "text-expense"}`}>
                        {hideValues ? "••••" : `${currentValue >= 0 ? "+" : ""}${formatCurrency(currentValue - a.investedAmount)}`}
                      </p>
                      <p className={`text-xs ${a.investedAmount > 0 ? (currentValue >= a.investedAmount ? "text-income" : "text-expense") : "text-muted"}`}>
                        {a.investedAmount > 0 ? formatPercent(((currentValue - a.investedAmount) / a.investedAmount) * 100) : ""}
                      </p>
                    </td>
                    <td className="p-3 text-right tabular hidden lg:table-cell">{mask(a.avgPrice, hideValues)}</td>
                    <td className="p-3 text-right tabular hidden lg:table-cell">
                      {precoJusto > 0 ? mask(precoJusto, hideValues) : "-"}
                    </td>
                    <td className="p-3 text-right tabular">
                      {dyAnual > 0 ? (
                        <span className={`font-medium ${dyAnual > 8 ? "text-green-500" : dyAnual > 5 ? "text-yellow-500" : "text-red-500"}`}>
                          {formatPercent(dyAnual)}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                          className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-colors"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.ticker); }}
                          className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-expense transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="p-4 bg-surface/50">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                          <DetailItem label="Segmento" value={a.sector || a.subtype || a.type} />
                          <DetailItem label="Preço Médio" value={mask(a.avgPrice, hideValues)} />
                          <DetailItem label="Total Necessário" value={mask(a.targetTotal, hideValues)} />
                          <DetailItem label="Cotas Necessárias" value={String(a.sharesNeeded)} />
                          <DetailItem label="Falta" value={mask(a.missing, hideValues)} />
                          <DetailItem label="DY Anual (com JCP)" value={dyAnual > 0 ? `${dyAnual.toFixed(2)}%` : "-"} />
                          <DetailItem label="Preço Justo" value={precoJusto > 0 ? mask(precoJusto, hideValues) : "-"} />
                          <DetailItem label="Dia Pagamento" value={a.paymentDay ? `Dia ${a.paymentDay}` : "-"} />
                          <div>
                            <p className="text-muted mb-0.5">Valor Atual</p>
                            <p className={`font-medium tabular ${valueColor}`}>{mask(currentValue, hideValues)}</p>
                          </div>
                          <DetailItem
                            label="Retorno s/ Investido"
                            value={a.investedAmount > 0
                              ? formatPercent(((currentValue - a.investedAmount) / a.investedAmount) * 100)
                              : "-"}
                          />
                        </div>

                        {/* Lançamentos do ativo */}
                        <div className="mt-4">
                          <p className="text-xs text-muted font-medium uppercase tracking-wider mb-2">Lançamentos</p>
                          {(() => {
                            const assetTrades = getTrades().filter((t) => t.ticker === a.ticker).sort((a, b) => b.date.localeCompare(a.date));
                            if (assetTrades.length === 0) {
                              return <p className="text-xs text-muted py-2">Nenhum lançamento registrado</p>;
                            }
                            return (
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {assetTrades.slice(0, 10).map((t) => (
                                  <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-card rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.operation === "COMPRA" ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"}`}>
                                        {t.operation}
                                      </span>
                                      <span className="text-muted">{formatDate(t.date)}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-medium tabular">{t.quantity} cotas</span>
                                      <span className="text-muted mx-1">@</span>
                                      <span className="tabular">{mask(t.price, hideValues)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Rendimento (dividendos) */}
                        <div className="mt-4">
                          <p className="text-xs text-muted font-medium uppercase tracking-wider mb-2">Rendimento</p>
                          {(() => {
                            const assetDividends = getDividends().filter((d) => d.ticker === a.ticker).sort((a, b) => b.payment.localeCompare(a.payment));
                            if (assetDividends.length === 0) {
                              return <p className="text-xs text-muted py-2">Nenhum rendimento registrado</p>;
                            }
                            const totalDivs = assetDividends.reduce((s, d) => s + d.totalValue, 0);
                            return (
                              <>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {assetDividends.slice(0, 10).map((d) => (
                                    <div key={d.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-card rounded-lg">
                                      <span className="text-muted">{formatDate(d.payment)}</span>
                                      <span className="font-medium tabular text-income">+{formatCurrency(d.totalValue)}</span>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-muted mt-2 text-right">Total: <span className="font-medium text-income">{formatCurrency(totalDivs)}</span></p>
                              </>
                            );
                          })()}
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); setLotAsset(a); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface text-muted hover:text-foreground text-xs transition-colors"
                          >
                            <Layers className="size-3.5" /> Lotes
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailAsset(a); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface text-muted hover:text-foreground text-xs transition-colors"
                          >
                            Detalhes
                          </button>
                        </div>
                        {a.status && (
                          <p className="text-xs text-muted mt-3">Status: {a.status}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
      )}
      {priceOpen && <PriceUpdateDialog assets={assets} onClose={() => setPriceOpen(false)} onComplete={onRefresh} />}
      {detailAsset && (
        <AssetDetailPanel
          asset={detailAsset}
          dividends={getDividends()}
          trades={getTrades()}
          onClose={() => setDetailAsset(null)}
        />
      )}
      {lotAsset && (
        <LotsView asset={lotAsset} onClose={() => setLotAsset(null)} />
      )}
    </>
  );
}

function GoalBadge({ goal }: { goal: string }) {
  if (goal === "PAUSAR") {
    return <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-lg font-medium">PAUSAR</span>;
  }
  const num = Number(goal);
  if (!isNaN(num) && num > 0) {
    return <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg font-medium">{num}</span>;
  }
  return <span className="text-xs text-muted">-</span>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted mb-0.5">{label}</p>
      <p className="font-medium tabular">{value}</p>
    </div>
  );
}

function FixedIncomeSection({ records, hideValues, onRefresh, onEdit }: {
  records: FixedIncomeRecord[];
  hideValues: boolean;
  onRefresh: () => void;
  onEdit: (record: FixedIncomeRecord) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterInstitution, setFilterInstitution] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const institutions = useMemo(() => {
    const set = new Set(records.map((r) => r.institution).filter(Boolean));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    let result = records;
    if (filterType) result = result.filter((r) => r.type === filterType);
    if (filterInstitution) result = result.filter((r) => r.institution === filterInstitution);
    return result;
  }, [records, filterType, filterInstitution]);

  const summary = useMemo(() => getFixedIncomeSummary(records), [records]);

  function handleDelete(id: string) {
    if (confirm("Excluir este investimento?")) {
      deleteFixedIncome(id);
      onRefresh();
    }
  }

  function calcRow(r: FixedIncomeRecord) {
    const daysHeld = daysBetween(r.applicationDate, today);
    const irRate = getIRRate(daysHeld);
    const grossReturn = r.currentValue - r.investedAmount;
    const irValue = grossReturn > 0 ? grossReturn * (irRate / 100) : 0;
    const netReturn = grossReturn - irValue;
    const returnPct = r.investedAmount > 0 ? (grossReturn / r.investedAmount) * 100 : 0;
    const daysToMaturity = r.maturityDate ? Math.max(0, daysBetween(today, r.maturityDate)) : null;
    return { grossReturn, irValue, netReturn, returnPct, daysHeld, irRate, daysToMaturity };
  }

  if (records.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <Landmark className="size-8 text-muted mx-auto mb-3" />
        <p className="text-muted mb-2">Nenhum investimento de renda fixa</p>
        <p className="text-sm text-muted">Clique em "Novo Ativo" para adicionar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
        >
          <option value="">Todos os tipos</option>
          <option value="CDB">CDB</option>
          <option value="LCI">LCI</option>
          <option value="LCA">LCA</option>
        </select>
        {institutions.length > 0 && (
          <select
            value={filterInstitution}
            onChange={(e) => setFilterInstitution(e.target.value)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
          >
            <option value="">Todas as instituições</option>
            {institutions.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <p className="text-xs text-muted font-medium uppercase tracking-wider">
            {filtered.length} investimentos de renda fixa
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left font-medium whitespace-nowrap">Nome</th>
                <th className="p-3 text-left font-medium whitespace-nowrap">Instituição</th>
                <th className="p-3 text-center font-medium whitespace-nowrap">Tipo</th>
                <th className="p-3 text-center font-medium whitespace-nowrap">Indexador</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">Taxa</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">Aplicado</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">Atual</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">Rentab.</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">IR</th>
                <th className="p-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r) => {
                const c = calcRow(r);
                const isExpanded = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="hover:bg-card-hover transition-colors cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : r.id)}
                    >
                      <td className="p-3 text-xs font-medium whitespace-nowrap">{r.name}</td>
                      <td className="p-3 text-xs text-muted whitespace-nowrap">{r.institution}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.type] ?? "bg-surface text-muted"}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs whitespace-nowrap">{r.indexer}</td>
                      <td className="p-3 text-right text-xs tabular whitespace-nowrap">{r.rate > 0 ? `${r.rate}%` : "—"}</td>
                      <td className="p-3 text-right text-xs tabular whitespace-nowrap">{mask(r.investedAmount, hideValues)}</td>
                      <td className="p-3 text-right text-xs tabular font-medium whitespace-nowrap">{mask(r.currentValue, hideValues)}</td>
                      <td className={`p-3 text-right text-xs tabular font-medium whitespace-nowrap ${c.returnPct >= 0 ? "text-income" : "text-loss"}`}>
                        {hideValues ? "•••" : `${c.returnPct >= 0 ? "+" : ""}${c.returnPct.toFixed(2)}%`}
                      </td>
                      <td className="p-3 text-right text-xs tabular text-loss whitespace-nowrap">
                        {hideValues ? "•••" : `- R$ ${c.irValue.toFixed(2)}`}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit(r); }}
                            className="p-1 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-colors"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                            className="p-1 rounded-lg hover:bg-surface text-muted hover:text-expense transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="p-4 bg-surface/50">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <DetailItem label="Dias Aplicado" value={String(c.daysHeld)} />
                            <DetailItem label="Dias p/ Vencimento" value={c.daysToMaturity !== null ? String(c.daysToMaturity) : "—"} />
                            <DetailItem label="IR Regressivo" value={`${c.irRate}%`} />
                            <DetailItem label="Data Aplicação" value={formatDate(r.applicationDate)} />
                            {r.maturityDate && <DetailItem label="Data Vencimento" value={formatDate(r.maturityDate)} />}
                            <DetailItem label="Rentab. Bruta" value={hideValues ? "•••" : formatCurrency(c.grossReturn)} />
                            <DetailItem label="IR sobre Ganho" value={hideValues ? "•••" : `- R$ ${c.irValue.toFixed(2)}`} />
                            <DetailItem label="Rentab. Líquida" value={hideValues ? "•••" : formatCurrency(c.netReturn)} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
    </div>
  );
}
