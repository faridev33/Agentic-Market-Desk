import {
  annualizedVolatility,
  maxDrawdown,
  mean,
  round,
  sharpeRatio,
  sortinoRatio,
  sum,
} from "../lib/math.js";

export interface EquityPoint {
  date: string;
  equity: number;
  position: 0 | 1;
}

export type ExitReason = "signal" | "stop" | "final_liquidation";

export interface TradeRecord {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  pnl: number;
  returnPct: number;
  barsHeld: number;
  exitReason: ExitReason;
  fees: number;
}

export interface BacktestMetrics {
  initialEquity: number;
  finalEquity: number;
  totalReturnPct: number;
  cagrPct: number;
  annualizedVolPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  calmar: number;
  winRatePct: number;
  profitFactor: number | null;
  avgTradePct: number;
  avgWinPct: number;
  avgLossPct: number;
  tradeCount: number;
  exposurePct: number;
  turnoverPct: number;
  feesPaid: number;
  buyHoldReturnPct: number;
  excessReturnPct: number;
}

function dailyReturns(curve: readonly EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i += 1) {
    const previous = curve[i - 1].equity;
    if (previous > 0) returns.push(curve[i].equity / previous - 1);
  }
  return returns;
}

export function computeMetrics(
  curve: readonly EquityPoint[],
  trades: readonly TradeRecord[],
  buyHoldReturnPct: number,
  riskFreeRatePct = 0,
): BacktestMetrics {
  const initialEquity = curve[0]?.equity ?? 0;
  const finalEquity = curve[curve.length - 1]?.equity ?? 0;

  if (curve.length < 2) {
    return {
      initialEquity: round(initialEquity, 2),
      finalEquity: round(finalEquity, 2),
      totalReturnPct: 0,
      cagrPct: 0,
      annualizedVolPct: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdownPct: 0,
      calmar: 0,
      winRatePct: 0,
      profitFactor: null,
      avgTradePct: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      tradeCount: trades.length,
      exposurePct: 0,
      turnoverPct: 0,
      feesPaid: 0,
      buyHoldReturnPct: round(buyHoldReturnPct, 2),
      excessReturnPct: round(-buyHoldReturnPct, 2),
    };
  }

  const totalReturn = initialEquity > 0 ? finalEquity / initialEquity - 1 : 0;
  const returns = dailyReturns(curve);
  const tradingDays = curve.length - 1;
  const cagr =
    initialEquity > 0 && finalEquity > 0 && tradingDays > 0
      ? Math.pow(finalEquity / initialEquity, 252 / tradingDays) - 1
      : 0;
  const volatility = annualizedVolatility(returns);
  const drawdown = maxDrawdown(curve.map((point) => point.equity));

  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = sum(wins.map((trade) => trade.pnl));
  const grossLoss = Math.abs(sum(losses.map((trade) => trade.pnl)));
  const tradedNotional = sum(
    trades.map((trade) => trade.shares * trade.entryPrice + trade.shares * trade.exitPrice),
  );
  const averageEquity = mean(curve.map((point) => point.equity));
  const exposedDays = curve.filter((point) => point.position === 1).length;

  return {
    initialEquity: round(initialEquity, 2),
    finalEquity: round(finalEquity, 2),
    totalReturnPct: round(totalReturn * 100, 2),
    cagrPct: round(cagr * 100, 2),
    annualizedVolPct: round(volatility * 100, 2),
    sharpe: round(sharpeRatio(returns, riskFreeRatePct / 100), 3),
    sortino: round(sortinoRatio(returns, riskFreeRatePct / 100), 3),
    maxDrawdownPct: round(drawdown, 2),
    calmar: drawdown > 0 ? round((cagr * 100) / drawdown, 3) : 0,
    winRatePct: trades.length > 0 ? round((wins.length / trades.length) * 100, 2) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : null,
    avgTradePct: trades.length > 0 ? round(mean(trades.map((trade) => trade.returnPct)), 2) : 0,
    avgWinPct: wins.length > 0 ? round(mean(wins.map((trade) => trade.returnPct)), 2) : 0,
    avgLossPct: losses.length > 0 ? round(mean(losses.map((trade) => trade.returnPct)), 2) : 0,
    tradeCount: trades.length,
    exposurePct: round((exposedDays / curve.length) * 100, 2),
    turnoverPct: averageEquity > 0 ? round((tradedNotional / averageEquity) * 100, 2) : 0,
    feesPaid: round(sum(trades.map((trade) => trade.fees)), 2),
    buyHoldReturnPct: round(buyHoldReturnPct, 2),
    excessReturnPct: round(totalReturn * 100 - buyHoldReturnPct, 2),
  };
}
