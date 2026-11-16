import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Candle, PortfolioItem, Quote } from "../api";
import { fmtMoney, fmtNumber, fmtPct, fmtSigned } from "../format";
import { IDX_UNIVERSE } from "../market";
import { Badge, Card } from "./ui";

export interface TechnicalForecast {
  targetPrice: number;
  upsidePct: number;
  upsideProb: number; // 0–100
  upsideLabel: "Tinggi" | "Sedang" | "Rendah";
  supportPrice: number;
  downsidePct: number;
  downsideProb: number; // 0–100
  downsideLabel: "Rendah" | "Sedang" | "Tinggi";
  actionAdvice: string;
  actionTone: "buy" | "sell" | "warn" | "ok";
  rsi?: number | null;
  sma50?: number | null;
}

const STORAGE_KEY = "amd_user_portfolio_v1";

const INITIAL_PORTFOLIO: PortfolioItem[] = [
  {
    id: "p-bbca-1",
    symbol: "BBCA.JK",
    name: "Bank Central Asia",
    sector: "Perbankan",
    buyPrice: 5000,
    lots: 10,
    shares: 1000,
    buyDate: "2026-10-15",
    notes: "Investasi jangka menengah, target dividen & apresiasi modal",
  },
  {
    id: "p-tlkm-2",
    symbol: "TLKM.JK",
    name: "Telkom Indonesia",
    sector: "Telekomunikasi",
    buyPrice: 2850,
    lots: 20,
    shares: 2000,
    buyDate: "2026-10-22",
    notes: "Swing trading pantulan support teknikal",
  },
  {
    id: "p-bmri-3",
    symbol: "BMRI.JK",
    name: "Bank Mandiri",
    sector: "Perbankan",
    buyPrice: 4800,
    lots: 15,
    shares: 1500,
    buyDate: "2026-11-01",
    notes: "Kawal tren laba kuartal 3",
  },
];

function calculateRsi(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const closes = candles.map((c) => c.close);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function calculateForecast(
  quote: Quote | null,
  candles: Candle[],
  buyPrice: number,
): TechnicalForecast {
  const currentPrice = quote?.price ?? buyPrice;
  const closes = candles.map((c) => c.close).filter((c) => Number.isFinite(c) && c > 0);

  // Hitung SMA 20 dan SMA 50
  const sma20 =
    closes.length >= 20
      ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : currentPrice;
  const sma50 =
    closes.length >= 50
      ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50
      : sma20;

  // Hitung RSI 14
  const rsi = calculateRsi(candles, 14);

  // Highest High & Lowest Low 20-hari
  const recentHighs = candles.slice(-20).map((c) => c.high);
  const recentLows = candles.slice(-20).map((c) => c.low);
  const max20 = recentHighs.length > 0 ? Math.max(...recentHighs) : currentPrice * 1.08;
  const min20 = recentLows.length > 0 ? Math.min(...recentLows) : currentPrice * 0.92;

  // Target Harga (Resistance / Potensi Naik)
  const targetPrice = Math.round(
    Math.max(currentPrice * 1.04, Math.min(max20, currentPrice * 1.15)),
  );
  const upsidePct = +(((targetPrice - currentPrice) / currentPrice) * 100).toFixed(2);

  // Level Support (Risiko Turun)
  const supportPrice = Math.round(
    Math.min(currentPrice * 0.96, Math.max(min20, currentPrice * 0.88)),
  );
  const downsidePct = +(((currentPrice - supportPrice) / currentPrice) * 100).toFixed(2);

  // Model Probabilitas Naik & Turun
  let probScore = 50; // base 50%

  if (currentPrice > sma20) probScore += 8;
  else probScore -= 8;

  if (currentPrice > sma50) probScore += 10;
  else probScore -= 10;

  if (rsi !== null) {
    if (rsi < 35) probScore += 16; // oversold, peluang rebound tinggi
    else if (rsi >= 40 && rsi <= 62) probScore += 9; // tren naik sehat
    else if (rsi > 72) probScore -= 18; // overbought, rentan koreksi
  }

  const change = quote?.changePct ?? 0;
  if (change > 0) probScore += 5;
  else if (change < 0) probScore -= 5;

  // Bound probabilitas antara 15% dan 85%
  const upsideProb = Math.min(85, Math.max(15, Math.round(probScore)));
  const downsideProb = 100 - upsideProb;

  const upsideLabel: "Tinggi" | "Sedang" | "Rendah" =
    upsideProb >= 62 ? "Tinggi" : upsideProb >= 45 ? "Sedang" : "Rendah";
  const downsideLabel: "Rendah" | "Sedang" | "Tinggi" =
    downsideProb <= 38 ? "Rendah" : downsideProb <= 55 ? "Sedang" : "Tinggi";

  // Saran Tindakan berdasarkan PnL dan Probabilitas
  const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
  let actionAdvice = "⚖️ Pertahankan Posisi (Hold)";
  let actionTone: "buy" | "sell" | "warn" | "ok" = "ok";

  if (pnlPct >= 12 && (rsi ?? 50) > 68) {
    actionAdvice = "🎯 Amankan Sebagian (Take Profit)";
    actionTone = "buy";
  } else if (pnlPct >= 5 && upsideProb >= 55) {
    actionAdvice = "📈 Kawal Profit (Trailing Stop)";
    actionTone = "ok";
  } else if (pnlPct <= -8 || currentPrice < supportPrice) {
    actionAdvice = "🛡️ Batasi Risiko (Stop Loss)";
    actionTone = "sell";
  } else if (pnlPct <= -3 && upsideProb >= 60) {
    actionAdvice = "🛒 Pantau Rebound (Akumulasi)";
    actionTone = "warn";
  }

  return {
    targetPrice,
    upsidePct,
    upsideProb,
    upsideLabel,
    supportPrice,
    downsidePct,
    downsideProb,
    downsideLabel,
    actionAdvice,
    actionTone,
    rsi,
    sma50: Math.round(sma50),
  };
}

export function PortfolioTracker({
  onSelectSymbol,
}: {
  onSelectSymbol?: (symbol: string) => void;
}) {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PortfolioItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_PORTFOLIO;
  });

  const [loadingData, setLoadingData] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Dialog Tambah / Edit
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSymbol, setFormSymbol] = useState("BBCA.JK");
  const [formBuyPrice, setFormBuyPrice] = useState("5000");
  const [formLots, setFormLots] = useState("10");
  const [formBuyDate, setFormBuyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dialog Konfirmasi Hapus
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<PortfolioItem | null>(null);

  // Ambil data portofolio dari SQLite Database Server saat pertama dimuat
  const loadPortfolioFromDb = useCallback(async () => {
    try {
      setLoadingData(true);
      const items = await api.getPortfolio();
      if (Array.isArray(items) && items.length > 0) {
        setPortfolio(items);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch {
      // jika gagal terhubung ke backend, gunakan localStorage
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void loadPortfolioFromDb();
  }, [loadPortfolioFromDb]);

  // Simpan ke localStorage sebagai backup cache lokal
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    } catch {
      // ignore
    }
  }, [portfolio]);

  // Muat harga terkini & candle history untuk semua emiten dalam portofolio
  const refreshPrices = useCallback(async () => {
    if (portfolio.length === 0) return;
    setLoadingPrices(true);
    const uniqueSymbols = [...new Set(portfolio.map((item) => item.symbol))];

    await Promise.allSettled(
      uniqueSymbols.map(async (symbol) => {
        try {
          const q = await api.quote(symbol);
          setQuotes((prev) => ({ ...prev, [symbol]: q }));
        } catch {
          // ignore quote error
        }

        try {
          const h = await api.history(symbol, { range: "3mo", interval: "1d" });
          if (h?.candles) {
            setCandles((prev) => ({ ...prev, [symbol]: h.candles }));
          }
        } catch {
          // ignore history error
        }
      }),
    );
    setLoadingPrices(false);
  }, [portfolio]);

  useEffect(() => {
    void refreshPrices();
  }, [refreshPrices]);

  // Hitung total ringkasan portofolio
  const summary = useMemo(() => {
    let totalCost = 0;
    let totalCurrentValue = 0;
    let dayGainNominal = 0;

    for (const item of portfolio) {
      const q = quotes[item.symbol];
      const curPrice = q?.price ?? item.buyPrice;
      const prevClose = q?.previousClose ?? curPrice;
      const cost = item.buyPrice * item.shares;
      const value = curPrice * item.shares;
      const dayDiff = (curPrice - prevClose) * item.shares;

      totalCost += cost;
      totalCurrentValue += value;
      dayGainNominal += dayDiff;
    }

    const totalPnl = totalCurrentValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dayGainPct = totalCurrentValue > 0 ? (dayGainNominal / (totalCurrentValue - dayGainNominal)) * 100 : 0;

    return {
      totalCost,
      totalCurrentValue,
      totalPnl,
      totalPnlPct,
      dayGainNominal,
      dayGainPct,
      count: portfolio.length,
    };
  }, [portfolio, quotes]);

  // Buka Modal Tambah
  function openAddModal() {
    setFormSymbol("BBCA.JK");
    setFormBuyPrice("5000");
    setFormLots("10");
    setFormBuyDate(new Date().toISOString().slice(0, 10));
    setFormNotes("");
    setFormError(null);
    setEditingId(null);
    setModalMode("add");
  }

  // Buka Modal Edit
  function openEditModal(item: PortfolioItem) {
    setEditingId(item.id);
    setFormSymbol(item.symbol);
    setFormBuyPrice(String(item.buyPrice));
    setFormLots(String(item.lots));
    setFormBuyDate(item.buyDate || new Date().toISOString().slice(0, 10));
    setFormNotes(item.notes || "");
    setFormError(null);
    setModalMode("edit");
  }

  // Simpan Form (Tambah / Edit) ke Database SQLite
  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const symClean = formSymbol.trim().toUpperCase();
    const finalSym = symClean.endsWith(".JK") ? symClean : `${symClean}.JK`;
    const priceNum = Number(formBuyPrice.replace(/[^0-9]/g, ""));
    const lotsNum = Number(formLots.replace(/[^0-9]/g, ""));

    if (!priceNum || priceNum <= 0) {
      setFormError("Harga beli harus lebih besar dari 0.");
      return;
    }
    if (!lotsNum || lotsNum <= 0) {
      setFormError("Jumlah lot harus minimal 1 lot (100 lembar).");
      return;
    }

    const matchedStock = IDX_UNIVERSE.find((s) => s.symbol === finalSym);
    const stockName = matchedStock?.name ?? finalSym.replace(/\.JK$/, "");
    const stockSector = matchedStock?.sector ?? "Pasar Modal";

    setSubmitting(true);
    try {
      if (modalMode === "edit" && editingId) {
        const updated = await api.updatePortfolioItem(editingId, {
          symbol: finalSym,
          name: stockName,
          sector: stockSector,
          buyPrice: priceNum,
          lots: lotsNum,
          buyDate: formBuyDate,
          notes: formNotes.trim(),
        });
        setPortfolio((prev) =>
          prev.map((item) => (item.id === editingId ? updated : item)),
        );
      } else {
        const created = await api.addPortfolioItem({
          symbol: finalSym,
          name: stockName,
          sector: stockSector,
          buyPrice: priceNum,
          lots: lotsNum,
          buyDate: formBuyDate,
          notes: formNotes.trim(),
        });
        setPortfolio((prev) => [created, ...prev]);
      }
      setModalMode(null);
    } catch (err: unknown) {
      // Fallback lokal jika API server gagal
      if (modalMode === "edit" && editingId) {
        setPortfolio((prev) =>
          prev.map((item) =>
            item.id === editingId
              ? {
                  ...item,
                  symbol: finalSym,
                  name: stockName,
                  sector: stockSector,
                  buyPrice: priceNum,
                  lots: lotsNum,
                  shares: lotsNum * 100,
                  buyDate: formBuyDate,
                  notes: formNotes.trim(),
                }
              : item,
          ),
        );
      } else {
        const newItem: PortfolioItem = {
          id: `porto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          symbol: finalSym,
          name: stockName,
          sector: stockSector,
          buyPrice: priceNum,
          lots: lotsNum,
          shares: lotsNum * 100,
          buyDate: formBuyDate,
          notes: formNotes.trim(),
        };
        setPortfolio((prev) => [newItem, ...prev]);
      }
      setModalMode(null);
    } finally {
      setSubmitting(false);
    }
  }

  // Hapus Emiten dari Portofolio (Hapus dari Database SQLite)
  async function handleDeleteItem(item: PortfolioItem) {
    try {
      await api.deletePortfolioItem(item.id);
    } catch {
      // ignore
    }
    setPortfolio((prev) => prev.filter((p) => p.id !== item.id));
    setDeleteConfirmItem(null);
  }

  const calculatedCapital = useMemo(() => {
    const p = Number(formBuyPrice.replace(/[^0-9]/g, "")) || 0;
    const l = Number(formLots.replace(/[^0-9]/g, "")) || 0;
    return p * l * 100;
  }, [formBuyPrice, formLots]);

  return (
    <section className="portfolio-section" aria-label="Pantau Portofolio Saya">
      {/* ── Heading Portofolio ── */}
      <div className="portfolio-head">
        <div>
          <div className="portfolio-kicker">
            <span>PORTFOLIO DESK / 01</span>
            <i />
            LIVE ASSET MONITOR
          </div>
          <h2 className="portfolio-title">Pantau Portofolio Saya</h2>
          <p className="portfolio-sub">
            Pantau modal masuk, harga beli, nilai pasar terkini, estimasi kemungkinan naik/turun,
            serta saran tindakan berbasis analisis teknikal &amp; kuantitatif.
          </p>
        </div>

        <div className="portfolio-head-actions">
          <Badge tone="ok">💾 Database SQLite</Badge>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void refreshPrices()}
            disabled={loadingPrices || loadingData}
            title="Segarkan harga terkini saham"
          >
            {loadingPrices ? "Memperbarui harga…" : "⟳ Segarkan Harga"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm portfolio-add-btn"
            onClick={openAddModal}
          >
            + Tambah Saham
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ("Beli Apa Saja") ── */}
      <div className="portfolio-summary-grid">
        <Card className="portfolio-kpi-card">
          <span className="kpi-label">Total Modal Pembelian</span>
          <strong className="kpi-value">{fmtMoney(summary.totalCost, "IDR", 0)}</strong>
          <small className="kpi-note">{summary.count} emiten dalam portofolio</small>
        </Card>

        <Card className="portfolio-kpi-card">
          <span className="kpi-label">Nilai Pasar Saat Ini</span>
          <strong className="kpi-value">{fmtMoney(summary.totalCurrentValue, "IDR", 0)}</strong>
          <small className="kpi-note">
            Perubahan hari ini:{" "}
            <span
              className={
                summary.dayGainNominal >= 0 ? "kpi-change--up" : "kpi-change--down"
              }
            >
              {fmtSigned(summary.dayGainNominal, 0)} ({fmtPct(summary.dayGainPct, 2, true)})
            </span>
          </small>
        </Card>

        <Card
          className={`portfolio-kpi-card ${
            summary.totalPnl >= 0 ? "kpi-card--profit" : "kpi-card--loss"
          }`}
        >
          <span className="kpi-label">Untung / Rugi (Floating P&amp;L)</span>
          <div className="kpi-pnl-row">
            <strong
              className={`kpi-value ${
                summary.totalPnl >= 0 ? "pnl-val--up" : "pnl-val--down"
              }`}
            >
              {summary.totalPnl >= 0 ? "+" : ""}
              {fmtMoney(summary.totalPnl, "IDR", 0)}
            </strong>
            <Badge tone={summary.totalPnl >= 0 ? "buy" : "sell"}>
              {fmtPct(summary.totalPnlPct, 2, true)}
            </Badge>
          </div>
          <small className="kpi-note">
            {summary.totalPnl >= 0 ? "🟢 Portofolio dalam kondisi untung" : "🔴 Portofolio dalam posisi minus"}
          </small>
        </Card>
      </div>

      {/* ── Alokasi Portofolio Visual ── */}
      {portfolio.length > 0 && summary.totalCurrentValue > 0 && (
        <Card className="portfolio-alloc-card">
          <div className="alloc-header">
            <span>Komposisi Portofolio ("Beli Apa Saja")</span>
            <small>{summary.count} saham terdiversifikasi</small>
          </div>
          <div className="alloc-bar" title="Distribusi nilai emiten">
            {portfolio.map((item, idx) => {
              const q = quotes[item.symbol];
              const cur = q?.price ?? item.buyPrice;
              const val = cur * item.shares;
              const pct = (val / summary.totalCurrentValue) * 100;
              const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
              const bg = colors[idx % colors.length]!;
              return (
                <div
                  key={item.id}
                  className="alloc-segment"
                  style={{ width: `${Math.max(3, pct)}%`, backgroundColor: bg }}
                  title={`${item.symbol.replace(/\.JK$/, "")}: ${pct.toFixed(1)}% (${fmtMoney(val, "IDR", 0)})`}
                />
              );
            })}
          </div>
          <div className="alloc-legend">
            {portfolio.map((item, idx) => {
              const q = quotes[item.symbol];
              const cur = q?.price ?? item.buyPrice;
              const val = cur * item.shares;
              const pct = (val / summary.totalCurrentValue) * 100;
              const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
              const dotColor = colors[idx % colors.length]!;
              return (
                <span key={item.id} className="alloc-pill">
                  <span className="alloc-dot" style={{ backgroundColor: dotColor }} />
                  <b>{item.symbol.replace(/\.JK$/, "")}</b> {pct.toFixed(1)}%
                </span>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Tabel / Kartu Daftar Portofolio ── */}
      <Card className="portfolio-table-card">
        {portfolio.length === 0 ? (
          <div className="portfolio-empty">
            <div className="portfolio-empty-icon">📊</div>
            <h3>Portofolio Masih Kosong</h3>
            <p>
              Tambahkan saham yang sudah Anda beli untuk mulai memantau keuntungan, risiko turun,
              dan potensi kenaikan secara real-time.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openAddModal}
            >
              + Tambah Saham Pertama Anda
            </button>
          </div>
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th scope="col">Emiten</th>
                  <th scope="col">Harga Beli &amp; Lot</th>
                  <th scope="col">Total Modal</th>
                  <th scope="col">Harga Terkini</th>
                  <th scope="col">Nilai Pasar</th>
                  <th scope="col">Untung / Rugi</th>
                  <th scope="col">📈 Kemungkinan Naik</th>
                  <th scope="col">📉 Kemungkinan Turun</th>
                  <th scope="col">Sinyal Tindakan</th>
                  <th scope="col" className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((item) => {
                  const q = quotes[item.symbol] ?? null;
                  const cList = candles[item.symbol] ?? [];
                  const curPrice = q?.price ?? item.buyPrice;
                  const cost = item.buyPrice * item.shares;
                  const marketVal = curPrice * item.shares;
                  const pnl = marketVal - cost;
                  const pnlPct = ((curPrice - item.buyPrice) / item.buyPrice) * 100;
                  const forecast = calculateForecast(q, cList, item.buyPrice);

                  return (
                    <tr key={item.id} className="portfolio-row">
                      {/* Emiten */}
                      <td>
                        <div className="porto-stock-cell">
                          <strong className="porto-symbol">
                            {item.symbol.replace(/\.JK$/, "")}
                          </strong>
                          <span className="porto-name">{item.name}</span>
                          <span className="porto-sector">{item.sector}</span>
                        </div>
                      </td>

                      {/* Harga Beli & Lot */}
                      <td>
                        <div className="porto-buy-cell">
                          <b className="porto-price">{fmtMoney(item.buyPrice, "IDR", 0)}</b>
                          <small className="porto-lots">
                            {item.lots} lot ({fmtNumber(item.shares, 0)} lbr)
                          </small>
                          {item.buyDate && (
                            <small className="porto-date">Tgl: {item.buyDate}</small>
                          )}
                        </div>
                      </td>

                      {/* Total Modal */}
                      <td>
                        <strong className="porto-cost">{fmtMoney(cost, "IDR", 0)}</strong>
                      </td>

                      {/* Harga Terkini */}
                      <td>
                        <div className="porto-live-cell">
                          <strong className="porto-cur-price">
                            {fmtMoney(curPrice, "IDR", 0)}
                          </strong>
                          {q && (
                            <small
                              className={
                                (q.changePct ?? 0) >= 0 ? "change--pos" : "change--neg"
                              }
                            >
                              {fmtPct(q.changePct, 2, true)}
                            </small>
                          )}
                        </div>
                      </td>

                      {/* Nilai Pasar */}
                      <td>
                        <strong className="porto-val">{fmtMoney(marketVal, "IDR", 0)}</strong>
                      </td>

                      {/* Untung / Rugi */}
                      <td>
                        <div className="porto-pnl-cell">
                          <strong
                            className={`porto-pnl-nom ${
                              pnl >= 0 ? "pnl-val--up" : "pnl-val--down"
                            }`}
                          >
                            {pnl >= 0 ? "+" : ""}
                            {fmtMoney(pnl, "IDR", 0)}
                          </strong>
                          <Badge tone={pnl >= 0 ? "buy" : "sell"}>
                            {fmtPct(pnlPct, 2, true)}
                          </Badge>
                        </div>
                      </td>

                      {/* Kemungkinan Naik */}
                      <td>
                        <div className="forecast-cell forecast-cell--up">
                          <div className="forecast-prob-row">
                            <span className="forecast-prob-val">
                              {forecast.upsideProb}% Peluang
                            </span>
                            <span className="forecast-prob-tag forecast-prob-tag--up">
                              {forecast.upsideLabel}
                            </span>
                          </div>
                          <div className="forecast-meter" aria-hidden="true">
                            <div
                              className="forecast-meter-fill forecast-meter-fill--up"
                              style={{ width: `${forecast.upsideProb}%` }}
                            />
                          </div>
                          <small className="forecast-target">
                            Target: <b>{fmtMoney(forecast.targetPrice, "IDR", 0)}</b> (+
                            {forecast.upsidePct}%)
                          </small>
                        </div>
                      </td>

                      {/* Kemungkinan Turun */}
                      <td>
                        <div className="forecast-cell forecast-cell--down">
                          <div className="forecast-prob-row">
                            <span className="forecast-prob-val">
                              {forecast.downsideProb}% Risiko
                            </span>
                            <span
                              className={`forecast-prob-tag forecast-prob-tag--${
                                forecast.downsideLabel === "Tinggi"
                                  ? "danger"
                                  : forecast.downsideLabel === "Sedang"
                                  ? "warn"
                                  : "safe"
                              }`}
                            >
                              {forecast.downsideLabel}
                            </span>
                          </div>
                          <div className="forecast-meter" aria-hidden="true">
                            <div
                              className={`forecast-meter-fill ${
                                forecast.downsideProb > 55
                                  ? "forecast-meter-fill--danger"
                                  : forecast.downsideProb > 38
                                  ? "forecast-meter-fill--warn"
                                  : "forecast-meter-fill--safe"
                              }`}
                              style={{ width: `${forecast.downsideProb}%` }}
                            />
                          </div>
                          <small className="forecast-support">
                            Support: <b>{fmtMoney(forecast.supportPrice, "IDR", 0)}</b> (-
                            {forecast.downsidePct}%)
                          </small>
                        </div>
                      </td>

                      {/* Sinyal Tindakan */}
                      <td>
                        <div className="action-cell">
                          <Badge tone={forecast.actionTone}>{forecast.actionAdvice}</Badge>
                          {forecast.rsi !== null && (
                            <small className="action-rsi">RSI 14: {forecast.rsi}</small>
                          )}
                        </div>
                      </td>

                      {/* Aksi Edit & Hapus */}
                      <td className="text-right">
                        <div className="porto-actions">
                          {onSelectSymbol && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => onSelectSymbol(item.symbol)}
                              title="Cek Saham ini"
                              aria-label="Cek Saham"
                            >
                              🔍
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => openEditModal(item)}
                            title="Edit data beli saham ini"
                            aria-label="Edit Saham"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon btn-danger-hover"
                            onClick={() => setDeleteConfirmItem(item)}
                            title="Hapus saham dari portofolio"
                            aria-label="Hapus Saham"
                          >
                            🗑️
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
      </Card>

      {/* ── MODAL TAMBAH / EDIT SAHAM ── */}
      {modalMode !== null && (
        <div className="portfolio-modal-overlay" role="dialog" aria-modal="true">
          <Card className="portfolio-modal-box">
            <div className="modal-box-header">
              <h3>
                {modalMode === "add" ? "Tambah Saham ke Portofolio" : "Edit Posisi Saham"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalMode(null)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="portfolio-form">
              {formError && <p className="inline-error">{formError}</p>}

              {/* Simbol Saham */}
              <div className="form-field">
                <label htmlFor="input-symbol">Simbol Emiten IDX</label>
                <div className="symbol-input-group">
                  <input
                    id="input-symbol"
                    type="text"
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                    placeholder="Contoh: BBCA.JK atau BMRI"
                    required
                    disabled={modalMode === "edit"}
                  />
                  <select
                    className="symbol-quick-pick"
                    onChange={(e) => {
                      if (e.target.value) setFormSymbol(e.target.value);
                    }}
                    value=""
                    aria-label="Pilih cepat saham IDX"
                    disabled={modalMode === "edit"}
                  >
                    <option value="">Pilih Cepat Saham Likuid...</option>
                    {IDX_UNIVERSE.map((stock) => (
                      <option key={stock.symbol} value={stock.symbol}>
                        {stock.symbol.replace(/\.JK$/, "")} - {stock.name} ({stock.sector})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Harga Beli & Jumlah Lot */}
              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="input-buyprice">Harga Beli (Rp / lembar)</label>
                  <input
                    id="input-buyprice"
                    type="number"
                    step="5"
                    min="1"
                    value={formBuyPrice}
                    onChange={(e) => setFormBuyPrice(e.target.value)}
                    placeholder="Contoh: 5000"
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="input-lots">Jumlah Lot (1 lot = 100 lembar)</label>
                  <input
                    id="input-lots"
                    type="number"
                    min="1"
                    step="1"
                    value={formLots}
                    onChange={(e) => setFormLots(e.target.value)}
                    placeholder="Contoh: 10"
                    required
                  />
                </div>
              </div>

              {/* Live Preview Kalkulasi Modal */}
              <div className="form-calc-preview">
                <span className="calc-preview-label">Kalkulasi Total Modal Pembelian:</span>
                <strong className="calc-preview-val">
                  {fmtMoney(calculatedCapital, "IDR", 0)}
                </strong>
                <small className="calc-preview-detail">
                  ({Number(formLots) || 0} lot × 100 = {fmtNumber((Number(formLots) || 0) * 100, 0)}{" "}
                  lembar @ {fmtMoney(Number(formBuyPrice) || 0, "IDR", 0)})
                </small>
              </div>

              {/* Tanggal Beli */}
              <div className="form-field">
                <label htmlFor="input-buydate">Tanggal Pembelian</label>
                <input
                  id="input-buydate"
                  type="date"
                  value={formBuyDate}
                  onChange={(e) => setFormBuyDate(e.target.value)}
                />
              </div>

              {/* Catatan / Rencana Trading */}
              <div className="form-field">
                <label htmlFor="input-notes">Catatan / Rencana Investasi (Opsional)</label>
                <input
                  id="input-notes"
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Misal: Beli swing target profit 8%, cut loss support jebol"
                />
              </div>

              {/* Tombol Simpan & Batal */}
              <div className="modal-box-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModalMode(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? "Menyimpan ke Database…"
                    : modalMode === "add"
                    ? "+ Simpan ke Portofolio"
                    : "✓ Perbarui Posisi"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ── MODAL KONFIRMASI HAPUS ── */}
      {deleteConfirmItem !== null && (
        <div className="portfolio-modal-overlay" role="dialog" aria-modal="true">
          <Card className="portfolio-modal-box modal-box--danger">
            <div className="modal-box-header">
              <h3>Hapus dari Portofolio?</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeleteConfirmItem(null)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <div className="modal-danger-body">
              <p>
                Apakah Anda yakin ingin menghapus posisi saham{" "}
                <strong>{deleteConfirmItem.symbol.replace(/\.JK$/, "")}</strong> (
                {deleteConfirmItem.lots} lot @ {fmtMoney(deleteConfirmItem.buyPrice, "IDR", 0)}) dari
                portofolio Anda?
              </p>
              <small className="danger-subnote">
                Tindakan ini tidak dapat dibatalkan, namun Anda dapat menambahkannya kembali nanti.
              </small>
            </div>

            <div className="modal-box-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeleteConfirmItem(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDeleteItem(deleteConfirmItem)}
              >
                🗑️ Ya, Hapus Saham
              </button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
