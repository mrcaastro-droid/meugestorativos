export interface Asset {
  id: string;
  ticker: string;
  type: string;
  subtype: string;
  sector: string;
  paymentDay: number | null;
  currentPrice: number;
  dividendPerShare: number;
  dividendYield: number;
  targetTotal: number;
  sharesNeeded: number;
  avgPrice: number;
  quantity: number;
  goal: string;
  investedAmount: number;
  manualInvested?: boolean;
  missing: number;
  currentDividend: number;
  annualReturn: number;
  magicMonth: number;
  magicNumber: number;
  divYield12m: number | null;
  representation: number;
  percentInPortfolio: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DividendRecord {
  id: string;
  ticker: string;
  type: string;
  monthYear: string;
  month: number;
  year: number;
  name: string;
  payment: string;
  movementType: string;
  totalValue: number;
  createdAt: string;
}

export interface TradeRecord {
  id: string;
  date: string;
  ticker: string;
  quantity: number;
  price: number;
  fees: number;
  irrf: number;
  totalWithoutFees: number;
  totalWithFees: number;
  priceWithFees: number;
  totalShares: number;
  avgPrice: number;
  operation: "COMPRA" | "VENDA";
  note?: string;
  createdAt: string;
}

export interface ContributionRecord {
  id: string;
  date: string;
  value: number;
  description: string;
  createdAt: string;
}

export interface Lot {
  id: string;
  ticker: string;
  purchaseDate: string;
  quantity: number;
  price: number;
  fees: number;
  remaining: number;
  createdAt: string;
}

export interface FixedIncomeRecord {
  id: string;
  name: string;
  institution: string;
  type: "CDB" | "LCI" | "LCA";
  indexer: "CDI" | "IPCA" | "SELIC" | "PRE";
  rate: number;
  applicationDate: string;
  maturityDate: string;
  investedAmount: number;
  currentValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalCurrentValue: number;
  monthlyDividend: number;
  annualDividend: number;
  projectedMonthlyDividend: number;
  projectedAnnualDividend: number;
  assetCount: number;
  types: Record<string, number>;
  sectors: Record<string, number>;
}
