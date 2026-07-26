import { useMemo, useState, useEffect } from "react";
import type { Asset } from "../types";
import { formatCurrency } from "../format";
import { getDividends } from "../store";
import { fetchLastDividends, fetchUpcomingDividends, type UpcomingDividend } from "../prices";
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from "lucide-react";

interface Props {
  assets: Asset[];
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function DividendCalendar({ assets }: Props) {
  const dividends = getDividends();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [divData, setDivData] = useState<Map<string, number>>(new Map());
  const [upcomingDivs, setUpcomingDivs] = useState<UpcomingDividend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tickers = [...new Set(assets.map((a) => a.ticker))];
    if (tickers.length === 0) return;
    setLoading(true);
    Promise.all([
      fetchLastDividends(tickers),
      fetchUpcomingDividends(tickers),
    ]).then(([divMap, upcoming]) => {
      setDivData(divMap);
      setUpcomingDivs(upcoming);
      setLoading(false);
    });
  }, [assets]);

  function getProjectedValue(a: Asset): number {
    const apiDiv = divData.get(a.ticker.toUpperCase());
    if (apiDiv && apiDiv > 0) return apiDiv * a.quantity;
    if (a.dividendPerShare && a.dividendPerShare > 0) return a.dividendPerShare * a.quantity;
    return a.currentDividend;
  }

  const monthEvents = useMemo(() => {
    const events: Record<number, { ticker: string; value: number; isProjected: boolean }[]> = {};

    for (const d of dividends) {
      const [y, m, day] = d.payment.split("-").map(Number);
      if (y === viewYear && m === viewMonth + 1) {
        if (!events[day]) events[day] = [];
        events[day].push({ ticker: d.ticker, value: d.totalValue, isProjected: false });
      }
    }

    const ownedTickers = new Set(assets.map((a) => a.ticker.toUpperCase()));
    for (const ud of upcomingDivs) {
      if (!ownedTickers.has(ud.ticker)) continue;
      const [y, m, day] = ud.date.split("-").map(Number);
      if (y !== viewYear || m !== viewMonth + 1) continue;
      if (!events[day]) events[day] = [];
      const alreadyPaid = events[day].some(
        (e) => e.ticker === ud.ticker && !e.isProjected
      );
      if (alreadyPaid) continue;
      const asset = assets.find((a) => a.ticker.toUpperCase() === ud.ticker);
      const value = ud.value * (asset?.quantity ?? 1);
      events[day].push({ ticker: ud.ticker, value, isProjected: false });
    }

    const now = new Date();
    for (const a of assets) {
      if (!a.paymentDay || a.paymentDay < 1 || a.paymentDay > 31) continue;
      const projDate = new Date(viewYear, viewMonth, a.paymentDay);
      const isFuture = projDate > now;
      if (!isFuture && viewYear < now.getFullYear()) continue;
      if (!isFuture && viewYear === now.getFullYear() && viewMonth < now.getMonth()) continue;
      if (!isFuture && viewYear === now.getFullYear() && viewMonth === now.getMonth() && a.paymentDay < now.getDate()) {
        const hasActual = dividends.some(
          (d) => d.ticker === a.ticker && d.payment === `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(a.paymentDay).padStart(2, "0")}`
        );
        if (hasActual) continue;
      }
      const alreadyInEvents = events[a.paymentDay]?.some((e) => e.ticker === a.ticker);
      if (alreadyInEvents) continue;
      const projValue = getProjectedValue(a);
      if (projValue <= 0) continue;
      if (!events[a.paymentDay]) events[a.paymentDay] = [];
      events[a.paymentDay].push({ ticker: a.ticker, value: projValue, isProjected: !!isFuture });
    }

    return events;
  }, [viewYear, viewMonth, assets, dividends, divData, upcomingDivs]);

  const calendar = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewYear, viewMonth]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const list: { date: Date; ticker: string; value: number; isProjected: boolean }[] = [];
    const ownedTickers = new Set(assets.map((a) => a.ticker.toUpperCase()));

    for (const ud of upcomingDivs) {
      if (!ownedTickers.has(ud.ticker)) continue;
      const dt = new Date(ud.date + "T12:00:00");
      if (dt <= now) continue;
      const asset = assets.find((a) => a.ticker.toUpperCase() === ud.ticker);
      const value = ud.value * (asset?.quantity ?? 1);
      if (value <= 0) continue;
      list.push({ date: dt, ticker: ud.ticker, value, isProjected: false });
    }

    for (const d of dividends) {
      const dt = new Date(d.payment + "T12:00:00");
      if (dt > now) {
        const already = list.some((l) => l.ticker === d.ticker && l.date.getTime() === dt.getTime());
        if (!already) list.push({ date: dt, ticker: d.ticker, value: d.totalValue, isProjected: false });
      }
    }

    for (const a of assets) {
      if (!a.paymentDay) continue;
      const projValue = getProjectedValue(a);
      if (projValue <= 0) continue;
      for (let m = 0; m < 12; m++) {
        const dt = new Date(now.getFullYear(), now.getMonth() + m, a.paymentDay);
        if (dt <= now) continue;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(a.paymentDay).padStart(2, "0")}`;
        const hasReal = dividends.some((d) => d.ticker === a.ticker && d.payment === key);
        const hasConfirmed = upcomingDivs.some(
          (ud) => ud.ticker.toUpperCase() === a.ticker.toUpperCase() && ud.date === key
        );
        if (!hasReal && !hasConfirmed) {
          list.push({ date: dt, ticker: a.ticker, value: projValue, isProjected: true });
        }
      }
    }

    return list.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 8);
  }, [assets, dividends, divData, upcomingDivs]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  }

  const monthTotalProjected = Object.values(monthEvents).flat().reduce((s, e) => s + e.value, 0);

  if (assets.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          Calendário de Proventos
        </h3>
        {loading && <RefreshCw className="size-3.5 text-muted animate-spin" />}
      </div>

      <div className="bg-surface rounded-xl p-3 mb-4">
        <p className="text-xs text-muted font-medium mb-2">Próximos Pagamentos</p>
        {upcoming.length === 0 ? (
          <p className="text-xs text-muted py-1">Nenhum pagamento previsto</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted tabular">{u.date.toLocaleDateString("pt-BR")}</span>
                  <span className="font-medium">{u.ticker}</span>
                  {u.isProjected && <span className="text-[10px] text-muted">(previsto)</span>}
                </div>
                <span className="font-medium tabular text-income">{formatCurrency(u.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-card-hover text-muted transition-colors">
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold capitalize">
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-card-hover text-muted transition-colors">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="bg-surface px-1.5 py-1.5 text-center text-[10px] text-muted font-medium">
            {wd}
          </div>
        ))}
        {calendar.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="bg-card p-1.5" />;
          const events = monthEvents[day] || [];
          const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
          const hasEvents = events.length > 0;
          const totalDay = events.reduce((s, e) => s + e.value, 0);
          return (
            <div
              key={day}
              className={`bg-card p-1.5 min-h-[56px] text-xs transition-colors ${
                isToday ? "ring-1 ring-primary" : ""
              } ${hasEvents ? "cursor-pointer hover:bg-card-hover" : ""}`}
            >
              <p className={`tabular font-medium mb-0.5 ${isToday ? "text-primary" : "text-muted"}`}>{day}</p>
              {hasEvents && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium text-income tabular">{formatCurrency(totalDay)}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {events.slice(0, 3).map((e, j) => (
                      <span
                        key={j}
                        className={`text-[9px] px-1 rounded-sm ${
                          e.isProjected ? "bg-primary/10 text-primary" : "bg-income/10 text-income"
                        }`}
                      >
                        {e.ticker}
                      </span>
                    ))}
                    {events.length > 3 && (
                      <span className="text-[9px] text-muted">+{events.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-income/60" />
          <span>Pago</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary/60" />
          <span>Previsto</span>
        </div>
        <div className="flex-1 text-right font-medium tabular text-income">
          Mês: {formatCurrency(monthTotalProjected)}
        </div>
      </div>
    </div>
  );
}