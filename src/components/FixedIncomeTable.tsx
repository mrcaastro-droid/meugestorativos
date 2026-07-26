import { useState, useMemo } from "react";
import type { FixedIncomeRecord } from "../types";
import { formatCurrency, formatDate } from "../format";
import { deleteFixedIncome, getFixedIncomeSummary } from "../store";
import { Trash2, Pencil, ChevronDown, ChevronUp, Landmark } from "lucide-react";

interface Props {
  records: FixedIncomeRecord[];
  hideValues: boolean;
  onRefresh: () => void;
  onEdit: (record: FixedIncomeRecord) => void;
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

function mask(v: number, hidden: boolean) {
  return hidden ? "R$ ••••" : formatCurrency(v);
}

const TYPE_COLORS: Record<string, string> = {
  CDB: "bg-[#f97316]/10 text-[#f97316]",
  LCI: "bg-[#ec4899]/10 text-[#ec4899]",
  LCA: "bg-[#ef4444]/10 text-[#ef4444]",
};

export function FixedIncomeTable({ records, hideValues, onRefresh, onEdit }: Props) {
  const [sortField, setSortField] = useState<keyof FixedIncomeRecord>("applicationDate");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterInstitution, setFilterInstitution] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => getFixedIncomeSummary(records), [records]);

  const institutions = useMemo(() => {
    const set = new Set(records.map((r) => r.institution).filter(Boolean));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() => {
    let result = records;
    if (filterType) result = result.filter((r) => r.type === filterType);
    if (filterInstitution) result = result.filter((r) => r.institution === filterInstitution);

    return [...result].sort((a, b) => {
      if (sortField === "investedAmount" || sortField === "currentValue" || sortField === "rate") {
        return sortAsc ? (a[sortField] as number) - (b[sortField] as number) : (b[sortField] as number) - (a[sortField] as number);
      }
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [records, sortField, sortAsc, filterType, filterInstitution]);

  function toggleSort(field: keyof FixedIncomeRecord) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }

  function SortHeader({ field, label }: { field: keyof FixedIncomeRecord; label: string }) {
    const active = sortField === field;
    return (
      <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        <span className="text-xs font-medium">{label}</span>
        {active && (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    );
  }

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted mb-1">Total Investido</p>
          <p className="text-lg font-bold tabular text-income">{mask(summary.totalInvested, hideValues)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted mb-1">Valor Atual</p>
          <p className="text-lg font-bold tabular">{mask(summary.totalCurrentValue, hideValues)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted mb-1">Rentabilidade</p>
          <p className={`text-lg font-bold tabular ${summary.totalReturn >= 0 ? "text-income" : "text-loss"}`}>
            {hideValues ? "•••" : `${summary.returnPct >= 0 ? "+" : ""}${summary.returnPct.toFixed(2)}%`}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted mb-1">Investimentos</p>
          <p className="text-lg font-bold tabular">{records.length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
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

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Landmark className="size-8 text-muted mx-auto mb-3" />
            <p className="text-muted">Nenhum investimento de renda fixa</p>
            <p className="text-xs text-muted mt-1">Clique em "Novo Investimento" para adicionar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left"><SortHeader field="name" label="Nome" /></th>
                  <th className="p-3 text-left"><SortHeader field="institution" label="Instituição" /></th>
                  <th className="p-3 text-center"><SortHeader field="type" label="Tipo" /></th>
                  <th className="p-3 text-center"><SortHeader field="indexer" label="Indexador" /></th>
                  <th className="p-3 text-right"><SortHeader field="rate" label="Taxa" /></th>
                  <th className="p-3 text-right"><SortHeader field="investedAmount" label="Aplicado" /></th>
                  <th className="p-3 text-right"><SortHeader field="currentValue" label="Atual" /></th>
                  <th className="p-3 text-right">Rentab.</th>
                  <th className="p-3 text-right">IR</th>
                  <th className="p-3 text-right w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const c = calcRow(r);
                  return (
                    <tr key={r.id} className="hover:bg-card-hover transition-colors">
                      <td className="p-3 text-xs font-medium">{r.name}</td>
                      <td className="p-3 text-xs text-muted">{r.institution}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.type] ?? "bg-surface text-muted"}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs">{r.indexer}</td>
                      <td className="p-3 text-right text-xs tabular">{r.rate > 0 ? `${r.rate}%` : "—"}</td>
                      <td className="p-3 text-right text-xs tabular">{mask(r.investedAmount, hideValues)}</td>
                      <td className="p-3 text-right text-xs tabular font-medium">{mask(r.currentValue, hideValues)}</td>
                      <td className={`p-3 text-right text-xs tabular font-medium ${c.returnPct >= 0 ? "text-income" : "text-loss"}`}>
                        {hideValues ? "•••" : `${c.returnPct >= 0 ? "+" : ""}${c.returnPct.toFixed(2)}%`}
                      </td>
                      <td className="p-3 text-right text-xs tabular text-loss">
                        {hideValues ? "•••" : `- R$ ${c.irValue.toFixed(2)}`}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEdit(r)}
                            className="p-1 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-colors"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1 rounded-lg hover:bg-surface text-muted hover:text-expense transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {institutions.length > 1 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-4">Por Instituição</h3>
          <div className="flex flex-wrap gap-2">
            {institutions.map((inst) => {
              const total = records.filter((r) => r.institution === inst).reduce((s, r) => s + r.currentValue, 0);
              return (
                <div key={inst} className="px-4 py-2 bg-surface rounded-xl text-xs">
                  <p className="text-muted">{inst}</p>
                  <p className="font-semibold mt-0.5 tabular">{mask(total, hideValues)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
