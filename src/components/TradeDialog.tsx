import { useState } from "react";
import { addTrade, getTrades, deleteTrade } from "../store";
import { X } from "lucide-react";
import type { TradeRecord } from "../types";

interface Props {
  onClose: () => void;
  tickers: string[];
  editTrade?: TradeRecord | null;
}

export function TradeDialog({ onClose, tickers, editTrade }: Props) {
  const [form, setForm] = useState({
    date: editTrade?.date ?? new Date().toISOString().slice(0, 10),
    ticker: editTrade?.ticker ?? tickers[0] ?? "",
    quantity: editTrade ? String(editTrade.quantity) : "",
    price: editTrade ? String(editTrade.price) : "",
    note: editTrade?.note ?? "",
  });

  const isEditing = !!editTrade;

  function update(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "price") {
        const p = parseFloat(value.replace(",", ".")) || 0;
        if (p <= 0 && value !== "") next.note = "BÔNUS";
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const ticker = form.ticker.toUpperCase().trim();
    const qty = parseFloat(form.quantity) || 0;
    const price = parseFloat(form.price.replace(",", ".")) || 0;
    if (!ticker || qty === 0) return;

    const absQty = Math.abs(qty);
    const totalOp = absQty * price;
    const isBuy = qty > 0;
    const operationType = isBuy ? "COMPRA" as const : "VENDA" as const;
    const irrf = isBuy ? 0 : +(totalOp * 0.0005).toFixed(2);

    const existing = getTrades();
    const other = editTrade ? existing.filter((t) => t.id !== editTrade.id) : existing;
    const sorted = [...other].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    const byTicker: Record<string, { shares: number; invested: number }> = {};
    sorted.forEach((t) => {
      const q = t.quantity;
      const abs = Math.abs(q);
      const opTotal = abs * t.price + (t.fees || 0);
      const prev = byTicker[t.ticker] ?? { shares: 0, invested: 0 };
      if (q > 0) {
        byTicker[t.ticker] = { shares: prev.shares + abs, invested: prev.invested + opTotal };
      } else {
        const proportion = prev.shares > 0 ? abs / prev.shares : 0;
        byTicker[t.ticker] = { shares: Math.max(0, prev.shares - abs), invested: prev.invested - prev.invested * proportion };
      }
    });

    const prev = byTicker[ticker] ?? { shares: 0, invested: 0 };
    let newShares: number;
    let newInvested: number;
    let avgPrice: number;

    if (isBuy) {
      newShares = prev.shares + absQty;
      newInvested = prev.invested + totalOp;
      avgPrice = newShares > 0 ? +(newInvested / newShares).toFixed(2) : 0;
    } else {
      newShares = Math.max(0, prev.shares - absQty);
      const proportion = prev.shares > 0 ? absQty / prev.shares : 0;
      newInvested = prev.invested - prev.invested * proportion;
      avgPrice = newShares > 0 ? +(newInvested / newShares).toFixed(2) : 0;
    }

    if (editTrade) deleteTrade(editTrade.id);

    addTrade({
      date: form.date,
      ticker,
      quantity: isBuy ? absQty : -absQty,
      price,
      fees: 0,
      irrf,
      totalWithoutFees: totalOp,
      totalWithFees: totalOp,
      priceWithFees: price,
      totalShares: newShares,
      avgPrice,
      operation: operationType,
      note: form.note.trim() || undefined,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="dialog-enter bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 mx-0">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">{isEditing ? "Editar Operação" : "Nova Operação"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-card-hover text-muted transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Data</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Código</label>
              <input
                type="text"
                value={form.ticker}
                onChange={(e) => update("ticker", e.target.value)}
                list="trade-ticker-list"
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
              <datalist id="trade-ticker-list">
                {tickers.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>

          <p className="text-xs text-muted bg-surface rounded-xl px-3 py-2">
            Quantidade positiva = <span className="text-income font-medium">COMPRA</span> | Quantidade negativa = <span className="text-expense font-medium">VENDA</span>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Quantidade</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)}
                placeholder="100"
                step="any"
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted font-medium">Preço (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="10,50"
                required
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted font-medium">Observação</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="Ex: BÔNUS, FRACIONÁRIO, etc."
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <p className="text-xs text-muted">
            Taxas, IRRF, totais, preço médio e posição acumulada são calculados automaticamente.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface text-muted hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors">
              {isEditing ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
