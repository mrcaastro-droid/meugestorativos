import { useState, useMemo } from "react";
import { addFixedIncome, updateFixedIncome } from "../store";
import type { FixedIncomeRecord } from "../types";
import { X } from "lucide-react";

interface Props {
  editing?: FixedIncomeRecord | null;
  onClose: () => void;
}

const TIPOS = ["CDB", "LCI", "LCA"];
const INDEXADORES = ["CDI", "IPCA", "SELIC", "PRE"];

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

export function FixedIncomeDialog({ editing, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    institution: editing?.institution ?? "",
    type: editing?.type ?? "CDB" as FixedIncomeRecord["type"],
    indexer: editing?.indexer ?? "CDI" as FixedIncomeRecord["indexer"],
    rate: editing?.rate?.toString() ?? "",
    applicationDate: editing?.applicationDate ?? today,
    maturityDate: editing?.maturityDate ?? "",
    investedAmount: editing?.investedAmount?.toString() ?? "",
    currentValue: editing?.currentValue?.toString() ?? "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const daysHeld = useMemo(() => {
    if (!form.applicationDate) return 0;
    return daysBetween(form.applicationDate, today);
  }, [form.applicationDate, today]);

  const daysToMaturity = useMemo(() => {
    if (!form.maturityDate) return 0;
    return Math.max(0, daysBetween(today, form.maturityDate));
  }, [form.maturityDate, today]);

  const irRate = useMemo(() => getIRRate(daysHeld), [daysHeld]);

  const returnData = useMemo(() => {
    const invested = parseFloat(form.investedAmount.replace(",", ".")) || 0;
    const current = parseFloat(form.currentValue.replace(",", ".")) || 0;
    const grossReturn = current - invested;
    const irValue = grossReturn > 0 ? grossReturn * (irRate / 100) : 0;
    const netReturn = grossReturn - irValue;
    const returnPct = invested > 0 ? (grossReturn / invested) * 100 : 0;
    return { grossReturn, irValue, netReturn, returnPct };
  }, [form.investedAmount, form.currentValue, irRate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invested = parseFloat(form.investedAmount.replace(",", "."));
    const current = parseFloat(form.currentValue.replace(",", "."));
    if (!form.name.trim() || !invested) return;

    const data = {
      name: form.name.trim(),
      institution: form.institution.trim(),
      type: form.type,
      indexer: form.indexer,
      rate: parseFloat(form.rate.replace(",", ".")) || 0,
      applicationDate: form.applicationDate,
      maturityDate: form.maturityDate,
      investedAmount: invested,
      currentValue: current || invested,
    };

    if (editing) {
      updateFixedIncome(editing.id, data);
    } else {
      addFixedIncome(data);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="dialog-enter bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg sm:mx-4 mx-0 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{editing ? "Editar" : "Novo"} Investimento</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card-hover text-muted transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted font-medium">Nome / Descrição</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="CDB Banco XP 110% CDI"
              required
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted font-medium">Instituição</label>
            <input
              type="text"
              value={form.institution}
              onChange={(e) => update("institution", e.target.value)}
              placeholder="XP Investimentos"
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Indexador</label>
              <select
                value={form.indexer}
                onChange={(e) => update("indexer", e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              >
                {INDEXADORES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted font-medium">Taxa</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
              placeholder="110 (ex: 110% do CDI)"
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-[11px] text-muted">% do indexador (CDI) ou % a.a. (PRÉ/IPCA)</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Data Aplicação</label>
              <input
                type="date"
                value={form.applicationDate}
                onChange={(e) => update("applicationDate", e.target.value)}
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Data Vencimento</label>
              <input
                type="date"
                value={form.maturityDate}
                onChange={(e) => update("maturityDate", e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Valor Aplicado (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.investedAmount}
                onChange={(e) => update("investedAmount", e.target.value)}
                placeholder="10.000,00"
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Valor Atual (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.currentValue}
                onChange={(e) => update("currentValue", e.target.value)}
                placeholder="10.500,00"
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {returnData.grossReturn !== 0 && (
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted font-medium">Resumo</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted">Dias aplicado:</span>
                  <span className="ml-1 font-medium">{daysHeld}</span>
                </div>
                <div>
                  <span className="text-muted">Dias p/ vencimento:</span>
                  <span className="ml-1 font-medium">{daysToMaturity || "—"}</span>
                </div>
                <div>
                  <span className="text-muted">IR regressivo:</span>
                  <span className="ml-1 font-medium">{irRate}%</span>
                </div>
                <div>
                  <span className="text-muted">Rentab. bruta:</span>
                  <span className={`ml-1 font-medium ${returnData.returnPct >= 0 ? "text-income" : "text-loss"}`}>
                    {returnData.returnPct >= 0 ? "+" : ""}{returnData.returnPct.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-border">
                <span className="text-muted">IR sobre ganho:</span>
                <span className="font-medium text-loss">- R$ {returnData.irValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Rentab. líquida:</span>
                <span className={`font-medium ${returnData.netReturn >= 0 ? "text-income" : "text-loss"}`}>
                  R$ {returnData.netReturn.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface text-muted hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors">
              {editing ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
