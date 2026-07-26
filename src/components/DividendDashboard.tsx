import { useMemo, useState } from "react";
import type { DividendRecord, Asset } from "../types";
import { formatCurrency } from "../format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { X } from "lucide-react";
import { AssetLogo } from "./AssetLogo";

interface Props {
  dividends: DividendRecord[];
  assets: Asset[];
  hideValues: boolean;
  onRefresh?: () => void;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function mask(v: number, hidden: boolean) {
  return hidden ? "R$ ••••" : formatCurrency(v);
}

export function DividendDashboard({ dividends, assets, hideValues, onRefresh }: Props) {
  const [filterType, setFilterType] = useState("");
  const [filterYears, setFilterYears] = useState<number[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");

  const availableTypes = useMemo(() => {
    return Array.from(new Set(dividends.map((d) => d.type))).sort();
  }, [dividends]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(dividends.map((d) => d.year))).sort((a, b) => b - a);
  }, [dividends]);

  const availableTickers = useMemo(() => {
    let filtered = dividends;
    if (filterType) filtered = filtered.filter((d) => d.type === filterType);
    if (filterYears.length > 0) filtered = filtered.filter((d) => filterYears.includes(d.year));
    return Array.from(new Set(filtered.map((d) => d.ticker))).sort();
  }, [dividends, filterType, filterYears]);

  const filtered = useMemo(() => {
    let f = dividends;
    if (filterType) f = f.filter((d) => d.type === filterType);
    if (filterYears.length > 0) f = f.filter((d) => filterYears.includes(d.year));
    if (selectedTicker) f = f.filter((d) => d.ticker === selectedTicker);
    return f;
  }, [dividends, filterType, filterYears, selectedTicker]);

  const totalDividends = useMemo(() => {
    return dividends.reduce((s, d) => s + d.totalValue, 0);
  }, [dividends]);

  const totalFiltered = useMemo(() => {
    return filtered.reduce((s, d) => s + d.totalValue, 0);
  }, [filtered]);

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((d) => { map[d.type] = (map[d.type] ?? 0) + d.totalValue; });
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map: Record<number, number> = {};
    filtered.forEach((d) => { map[d.month] = (map[d.month] ?? 0) + d.totalValue; });
    return Array.from({ length: 12 }, (_, i) => ({
      month: MONTHS[i],
      value: Math.round((map[i + 1] ?? 0) * 100) / 100,
    }));
  }, [filtered]);

  const byYear = useMemo(() => {
    const map: Record<number, number> = {};
    filtered.forEach((d) => {
      const y = typeof d.year === "number" && !isNaN(d.year) ? d.year : 0;
      map[y] = (map[y] ?? 0) + d.totalValue;
    });
    return Object.entries(map)
      .filter(([y]) => Number(y) > 2000)
      .map(([year, value]) => ({ year: Number(year), value: Math.round(value * 100) / 100 }))
      .sort((a, b) => a.year - b.year);
  }, [filtered]);

  function toggleYear(y: number) {
    setFilterYears((prev) =>
      prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y]
    );
  }

  function handleClearFilters() {
    setFilterType("");
    setFilterYears([]);
    setSelectedTicker("");
  }

  function handleClearType() {
    setFilterType("");
  }

  const hasActiveFilters = filterType || filterYears.length > 0 || selectedTicker;

  const avgMonthly = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let data = filtered;
    if (filterYears.length === 0) {
      data = data.filter((d) => d.year === currentYear);
    }
    const total = data.reduce((s, d) => s + d.totalValue, 0);
    return total / 12;
  }, [filtered, filterYears]);

  const avgAnnual = avgMonthly * 12;

  const patrimonyData = useMemo(() => {
    const byTicker: Record<string, { invested: number; current: number }> = {};
    for (const a of assets) {
      const key = a.ticker;
      if (!byTicker[key]) byTicker[key] = { invested: 0, current: 0 };
      byTicker[key].invested += a.investedAmount;
      byTicker[key].current += a.currentPrice * a.quantity;
    }
    return Object.entries(byTicker)
      .map(([ticker, v]) => ({
        ticker,
        "Valor Aplicado": Math.round(v.invested),
        Patrimônio: Math.round(v.current),
      }))
      .sort((a, b) => b.Patrimônio - a.Patrimônio)
      .slice(0, 15);
  }, [assets]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wider mb-1">Total Filtrado</p>
          <p className="text-xl font-bold tabular text-income">{mask(totalFiltered, hideValues)}</p>
          <p className="text-[10px] text-muted mt-0.5">de {mask(totalDividends, hideValues)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wider mb-1">Média Mensal</p>
          <p className="text-xl font-bold tabular text-primary">{mask(avgMonthly, hideValues)}</p>
          <p className="text-[10px] text-muted mt-0.5">anual: {mask(avgAnnual, hideValues)}</p>
        </div>
      </div>

      {/* Filters horizontal */}
      <div className="bg-card border border-border rounded-2xl p-3">
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
          >
            <option value="">Tipo</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={filterYears.length === 1 ? String(filterYears[0]) : ""}
            onChange={(e) => setFilterYears(e.target.value ? [Number(e.target.value)] : [])}
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
          >
            <option value="">Ano</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
          >
            <option value="">Ativo</option>
            {availableTickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Active filters summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Filtros:</span>
          {filterType && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {filterType}
              <button onClick={handleClearType}><X className="size-3" /></button>
            </span>
          )}
          {filterYears.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {filterYears.join(", ")}
              <button onClick={() => setFilterYears([])}><X className="size-3" /></button>
            </span>
          )}
          {selectedTicker && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {selectedTicker}
              <button onClick={() => setSelectedTicker("")}><X className="size-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Charts */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <p className="text-muted">Nenhum dividendo encontrado</p>
          <p className="text-xs text-muted mt-1">Importe dividendos ou ajuste os filtros</p>
        </div>
      ) : (
        <div className="space-y-5">
            {/* Active filters summary */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs text-muted">Filtros ativos:</span>
                {filterType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                    {filterType}
                    <button onClick={handleClearType} className="hover:text-primary/70"><X className="size-3" /></button>
                  </span>
                )}
                {filterYears.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                    {filterYears.length} ano{filterYears.length > 1 ? "s" : ""}
                    <button onClick={() => setFilterYears([])} className="hover:text-primary/70"><X className="size-3" /></button>
                  </span>
                )}
                {selectedTicker && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                    {selectedTicker}
                    <button onClick={() => setSelectedTicker("")} className="hover:text-primary/70"><X className="size-3" /></button>
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* % by class */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-4">Dividendos por Classe de Ativo</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byType}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={72} innerRadius={46}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, fontSize: 13 }}
                        formatter={(v: number) => formatCurrency(v)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dividends by month */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-4">Dividendos por Mês</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byMonth}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, fontSize: 13 }}
                        formatter={(v: number) => formatCurrency(v)}
                      />
                      <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Dividends by year - full width below */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-semibold text-sm mb-4">Dividendos por Ano</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byYear}>
                    <XAxis dataKey="year" tickFormatter={(v: number) => String(v)} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, fontSize: 13 }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Valor Aplicado x Patrimônio */}
            {patrimonyData.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-4">Valor Aplicado x Patrimônio</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patrimonyData} layout="vertical" barGap={0}>
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <YAxis type="category" dataKey="ticker" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, fontSize: 13 }}
                        formatter={(v: number) => formatCurrency(v)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Valor Aplicado" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                      <Bar dataKey="Patrimônio" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Year cards */}
            {byYear.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-4">Dividendos por Ano</h3>
                <div className="flex flex-wrap gap-2">
                  {byYear.map((y) => (
                    <div key={y.year} className="px-4 py-2 bg-surface rounded-xl text-xs">
                      <p className="text-muted">{y.year}</p>
                      <p className="font-semibold mt-0.5 tabular text-income">{mask(y.value, hideValues)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-ticker summary */}
            {(() => {
              const byTicker: Record<string, number> = {};
              filtered.forEach((d) => { byTicker[d.ticker] = (byTicker[d.ticker] ?? 0) + d.totalValue; });
              const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
              if (sorted.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-semibold text-sm mb-4">Dividendos por Ativo</h3>
                  <div className="flex flex-wrap gap-2">
                    {sorted.map(([ticker, value]) => (
                      <div key={ticker} className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl text-xs">
                        <AssetLogo ticker={ticker} size={16} />
                        <span className="text-muted font-medium">{ticker}</span>
                        <span className="font-semibold tabular text-income">{mask(value, hideValues)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
    </div>
  );
}
