import { loadRemoteData, saveRemoteData } from "./firebase";

export interface UserData {
  assets: any[];
  dividends: any[];
  contributions: any[];
  trades: any[];
  lots: any[];
  fixedIncome: any[];
  appName: string;
  updatedAt?: string;
}

export async function loadUserData(uid: string): Promise<UserData | null> {
  return loadRemoteData(uid);
}

export async function saveUserData(uid: string, data: UserData): Promise<boolean> {
  return saveRemoteData(uid, data);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUid: string | null = null;

function markSaved() {
  localStorage.setItem("gestor-last-save", String(Date.now()));
}

export function scheduleSave(uid: string, data: UserData) {
  pendingUid = uid;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (pendingUid) {
      const ok = await saveUserData(pendingUid, data);
      if (ok) markSaved();
    }
  }, 500);
}

export async function forceSaveNow(uid: string): Promise<boolean> {
  if (saveTimer) clearTimeout(saveTimer);
  const data = getAllLocalData();
  const ok = await saveUserData(uid, data);
  if (ok) markSaved();
  return ok;
}

export function getAllLocalData(): UserData {
  const assets = JSON.parse(localStorage.getItem("gestor-ativos-data") || "[]");
  const dividends = JSON.parse(localStorage.getItem("gestor-ativos-dividendos") || "[]");
  const contributions = JSON.parse(localStorage.getItem("gestor-ativos-aportes") || "[]");
  const trades = JSON.parse(localStorage.getItem("gestor-ativos-trades") || "[]");
  const lots = JSON.parse(localStorage.getItem("gestor-ativos-lotes") || "[]");
  const fixedIncome = JSON.parse(localStorage.getItem("gestor-ativos-renda-fixa") || "[]");
  const appName = localStorage.getItem("gestor-app-name") || "Gestor de Ativos";
  return { assets, dividends, contributions, trades, lots, fixedIncome, appName };
}

export function setLocalData(data: UserData) {
  localStorage.setItem("gestor-ativos-data", JSON.stringify(data.assets || []));
  localStorage.setItem("gestor-ativos-dividendos", JSON.stringify(data.dividends || []));
  localStorage.setItem("gestor-ativos-aportes", JSON.stringify(data.contributions || []));
  localStorage.setItem("gestor-ativos-trades", JSON.stringify(data.trades || []));
  localStorage.setItem("gestor-ativos-lotes", JSON.stringify(data.lots || []));
  if (data.fixedIncome && data.fixedIncome.length > 0) {
    localStorage.setItem("gestor-ativos-renda-fixa", JSON.stringify(data.fixedIncome));
  }
  if (data.appName) localStorage.setItem("gestor-app-name", data.appName);
}
