import { useCallback, useEffect, useState } from "react";
import type { Quote, ScreenerDetail } from "../api";
import { api, toApiError } from "../api";
import {
  fmtCompactMoney,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtPct,
  isNumber,
} from "../format";
import { displaySymbol, isIndexSymbol, normalizeSymbolInput } from "../market";
import { StockChart } from "./StockChart";
import { Badge, Card, EmptyState, Section, SkeletonBlock, Spinner } from "./ui";
import { DataUpdatedAt } from "./DataUpdatedAt";

const SYMBOL_PATTERN = /^[A-Za-z0-9.^=_-]{1,24}$/;

function money(value: number | null | undefined): string {
  return isNumber(value) ? fmtCompactMoney(value) : "—";
}

function num(value: number | null | undefined, digits = 2): string {
  return isNumber(value) ? fmtNumber(value, digits) : "—";
}

function pct(value: number | null | undefined, digits = 2, signed = false): string {
  return isNumber(value) ? fmtPct(value, digits, signed) : "—";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="cek-stat">
      <span>{label}</span>
      <strong className={tone ? `signed signed--${tone}` : undefined}>{value}</strong>
    </div>
  );
}

export interface CekSahamPageProps {
  symbol: string;
  quote: Quote | null;
  onSymbolChange: (symbol: string) => void;
  onRunAnalysis: (symbol: string) => void;
}

export function CekSahamPage({ symbol, quote, onSymbolChange, onRunAnalysis }: CekSahamPageProps) {
  const [input, setInput] = useState(() => (isIndexSymbol(symbol) ? "IHSG" : symbol));
  const [detail, setDetail] = useState<ScreenerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [detailNote, setDetailNote] = useState<string | null>(null);

  // IHSG (indeks) tidak punya laporan keuangan emiten, jadi cukup harga + grafik.
  const indexMode = isIndexSymbol(symbol);

  useEffect(() => {
    setInput(isIndexSymbol(symbol) ? "IHSG" : symbol);
  }, [symbol]);

  const load = useCallback((target: string) => {
    if (!SYMBOL_PATTERN.test(target) || isIndexSymbol(target)) {
      setDetail(null);
      setDetailNote(null);
      return;
    }
    setLoading(true);
    setDetailNote(null);
    void api
      .screenerDetail(target)
      .then((value) => setDetail(value))
      .catch((cause: unknown) => {
        const apiError = toApiError(cause);
        setDetail(null);
        // Fundamental hanya tersedia untuk emiten yang sudah pernah dipindai screener.
        setDetailNote(apiError.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(symbol);
  }, [load, symbol]);

  function submit() {
    const next = normalizeSymbolInput(input);
    if (!SYMBOL_PATTERN.test(next)) {
      setInputError("Simbol tidak valid. Gunakan huruf, angka, . ^ = _ -");
      return;
    }
    setInputError(null);
    if (next === symbol) {
      load(next);
    } else {
      onSymbolChange(next);
    }
  }

  const row = detail?.row ?? null;
  const keyStats = detail?.keyStats ?? null;
  const profile = detail?.profile ?? null;

  const price = quote?.price ?? row?.price ?? null;
  const changePct = quote?.changePct ?? row?.changePct ?? null;
  const high52 = quote?.fiftyTwoWeekHigh ?? row?.high52w ?? null;
  const low52 = quote?.fiftyTwoWeekLow ?? row?.low52w ?? null;
  const fromHighPct =
    isNumber(price) && isNumber(high52) && high52 > 0 ? ((price - high52) / high52) * 100 : null;
  const rangePct =
    isNumber(low52) && isNumber(high52) && high52 > low52 && isNumber(price)
      ? ((price - low52) / (high52 - low52)) * 100
      : null;

  const changeTone: "up" | "down" | undefined = isNumber(changePct)
    ? changePct > 0
      ? "up"
      : changePct < 0
        ? "down"
        : undefined
    : undefined;

  return (
    <div className="desk-layout">
      <aside className="desk-side">
        <Card className="panel form-panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Cek cepat</p>
              <h2>Cek saham</h2>
            </div>
            <Badge tone="muted">tanpa LLM</Badge>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="field">
              <label htmlFor="cek-symbol">Kode emiten / indeks</label>
              <input
                id="cek-symbol"
                value={input}
                onChange={(event) => setInput(event.target.value.toUpperCase())}
                placeholder="IHSG, BBCA, PTBA, ASII..."
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
              <p className="field-hint" style={{ marginTop: 6 }}>
                Ketik <strong>IHSG</strong> untuk melihat indeks gabungan.
              </p>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Mengambil data..." : "Cek sekarang"}
            </button>

            {indexMode ? (
              <p className="form-note">
                IHSG adalah indeks pasar, bukan emiten. Harga dan grafik ditampilkan apa adanya;
                pilih kode saham untuk melihat rasio dan laporan keuangan.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => onRunAnalysis(symbol)}
                >
                  Jalankan analisa 8 agen →
                </button>
                <p className="form-note">
                  Cek saham hanya membaca harga, rasio, dan laporan keuangan. Untuk rekomendasi
                  lengkap, jalankan pipeline 8 agen.
                </p>
              </>
            )}
          </form>
        </Card>

        <Card className="panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">{indexMode ? "Indeks pasar" : "Ringkasan"}</p>
              <h3>{displaySymbol(symbol)}</h3>
            </div>
            {quote?.marketState ? <Badge tone="info">{quote.marketState}</Badge> : null}
          </header>
          <div className="cek-quote-block">
            <div className="cek-price">{isNumber(price) ? fmtMoney(price, "IDR", 0) : "—"}</div>
            <div className={`cek-change signed signed--${changeTone ?? "flat"}`}>
              {isNumber(changePct) ? fmtPct(changePct, 2, true) : "—"}
              {quote?.previousClose ? (
                <span className="cek-prev">dari {fmtMoney(quote.previousClose, "IDR", 0)}</span>
              ) : null}
            </div>
            {isNumber(rangePct) ? (
              <div className="cek-range" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, rangePct))}%` }} />
              </div>
            ) : null}
            {isNumber(low52) && isNumber(high52) ? (
              <div className="cek-range-labels">
                <span>{fmtMoney(low52, "IDR", 0)}</span>
                <span>{fmtMoney(high52, "IDR", 0)}</span>
              </div>
            ) : null}
            <p className="cek-stamp">
              {quote ? `Quote ${fmtDateTime(quote.marketTime)}` : "Quote belum tersedia"}
            </p>
          </div>
        </Card>
      </aside>

      <div className="desk-main">
        <DataUpdatedAt
          timestamps={[
            { iso: quote?.fetchedAt, label: "Harga (quote)" },
            { iso: quote?.marketTime, label: "Waktu pasar" },
            { iso: detail?.fetchedAt, label: "Data fundamental" },
          ]}
        />

        {inputError ? (
          <p className="form-error" role="alert">
            {inputError}
          </p>
        ) : null}

        <StockChart
          symbol={symbol}
          name={
            indexMode
              ? "IHSG · Indeks Harga Saham Gabungan"
              : quote?.name ?? row?.name ?? null
          }
          currentPrice={price ?? undefined}
          changePct={changePct ?? undefined}
        />

        <Section
          eyebrow="Harga"
          title={indexMode ? "Ringkasan indeks" : "Ringkasan perdagangan"}
          aside={
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => load(symbol)}
              disabled={loading}
            >
              Muat ulang data
            </button>
          }
        >
          <div className="cek-grid">
            <Stat label="Harga" value={isNumber(price) ? fmtMoney(price, "IDR", 0) : "—"} />
            <Stat
              label="Perubahan"
              value={isNumber(changePct) ? fmtPct(changePct, 2, true) : "—"}
              tone={changeTone}
            />
            <Stat
              label="Penutupan sebelumnya"
              value={
                isNumber(quote?.previousClose)
                  ? fmtMoney(quote.previousClose, "IDR", 0)
                  : isNumber(row?.previousClose)
                    ? fmtMoney(row.previousClose, "IDR", 0)
                    : "—"
              }
            />
            <Stat label="Volume" value={num(quote?.volume ?? row?.volume, 0)} />
            <Stat label="Rata-rata vol 10 hari" value={num(quote?.averageVolume10d, 0)} />
            {indexMode ? null : (
              <Stat
                label="Kapitalisasi pasar"
                value={money(quote?.marketCap ?? row?.marketCap ?? keyStats?.marketCap)}
              />
            )}
            <Stat label="52 minggu tertinggi" value={isNumber(high52) ? fmtMoney(high52, "IDR", 0) : "—"} />
            <Stat label="52 minggu terendah" value={isNumber(low52) ? fmtMoney(low52, "IDR", 0) : "—"} />
            <Stat label="Jarak dari puncak" value={pct(fromHighPct, 1, true)} />
            {indexMode ? null : (
              <>
                <Stat label="Papan" value={row?.board ?? profile?.board ?? "—"} />
                <Stat label="Sektor" value={row?.sector ?? profile?.sector ?? "—"} />
                <Stat label="Status data" value={row?.dataStatus ?? "—"} />
              </>
            )}
          </div>
        </Section>

        {loading && !detail && !indexMode ? (
          <Card className="panel">
            <Spinner label="Mengambil rasio dan laporan keuangan..." />
            <SkeletonBlock lines={5} />
          </Card>
        ) : null}

        {detailNote && !indexMode ? (
          <Card className="panel">
            <EmptyState kicker="Fundamental belum tersedia" title="Data rasio belum ada di cache screener">
              <p>{detailNote}</p>
              <p className="muted">
                Harga dan grafik tetap bisa dicek. Untuk melengkapi rasio, jalankan pemindaian di
                halaman Screener lebih dulu, atau langsung minta pipeline 8 agen menganalisis emiten ini.
              </p>
            </EmptyState>
          </Card>
        ) : null}

        {keyStats ? (
          <Section eyebrow="Rasio" title="Valuasi & kesehatan keuangan">
            <div className="cek-grid">
              <Stat label="P/E" value={num(keyStats.trailingPE)} />
              <Stat label="P/E forward" value={num(keyStats.forwardPE)} />
              <Stat label="P/B" value={num(keyStats.priceToBook)} />
              <Stat label="EV/EBITDA" value={num(keyStats.evToEbitda)} />
              <Stat label="PEG" value={num(keyStats.pegRatio)} />
              <Stat label="Dividen" value={pct(keyStats.dividendYieldPct, 2)} />
              <Stat label="Beta" value={num(keyStats.beta)} />
              <Stat label="ROE" value={pct(keyStats.returnOnEquityPct, 2)} />
              <Stat label="ROA" value={pct(keyStats.returnOnAssetsPct, 2)} />
              <Stat label="Margin kotor" value={pct(keyStats.grossMarginPct, 2)} />
              <Stat label="Margin operasi" value={pct(keyStats.operatingMarginPct, 2)} />
              <Stat label="Margin bersih" value={pct(keyStats.profitMarginPct, 2)} />
              <Stat label="DER" value={pct(keyStats.debtToEquityPct, 1)} />
              <Stat label="Rasio lancar" value={num(keyStats.currentRatio)} />
              <Stat label="Kas" value={money(keyStats.totalCash)} />
              <Stat label="Utang" value={money(keyStats.totalDebt)} />
              <Stat label="Pendapatan" value={money(keyStats.revenue)} />
              <Stat label="Growth pendapatan" value={pct(keyStats.revenueGrowthPct, 2, true)} />
              <Stat label="Growth laba" value={pct(keyStats.earningsGrowthPct, 2, true)} />
              <Stat label="Arus kas operasi" value={money(keyStats.operatingCashflow)} />
              <Stat label="Free cash flow" value={money(keyStats.freeCashflow)} />
              <Stat label="Saham beredar" value={num(keyStats.sharesOutstanding, 0)} />
            </div>
          </Section>
        ) : null}

        {detail && detail.financials.length > 0 ? (
          <Section eyebrow="Laporan" title="Kinerja keuangan tahunan">
            <div className="cek-table-wrap">
              <table className="cek-table">
                <thead>
                  <tr>
                    <th>Tahun</th>
                    <th>Pendapatan</th>
                    <th>Laba bersih</th>
                    <th>Margin bersih</th>
                    <th>EPS</th>
                    <th>Ekuitas</th>
                    <th>Arus kas operasi</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.financials.slice(0, 5).map((period) => (
                    <tr key={period.fiscalYear}>
                      <td>{period.fiscalYear}</td>
                      <td className="num">{money(period.totalRevenue)}</td>
                      <td className="num">{money(period.netIncome)}</td>
                      <td className="num">{pct(period.netMarginPct, 2)}</td>
                      <td className="num">{num(period.basicEPS, 2)}</td>
                      <td className="num">{money(period.stockholdersEquity)}</td>
                      <td className="num">{money(period.operatingCashFlow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        {row && row.revenueTrend.length > 0 ? (
          <Section eyebrow="Tren" title="Pendapatan per tahun">
            <div className="cek-trend">
              {row.revenueTrend.map((point) => {
                const max = Math.max(...row.revenueTrend.map((item) => item.revenue ?? 0), 1);
                const height = Math.max(4, ((point.revenue ?? 0) / max) * 100);
                return (
                  <div key={point.fiscalYear} className="cek-trend-bar">
                    <span className="cek-trend-fill" style={{ height: `${height}%` }} />
                    <em>{point.fiscalYear}</em>
                    <small>{money(point.revenue)}</small>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}

        {profile ? (
          <Section eyebrow="Profil" title="Tentang emiten">
            <div className="cek-grid">
              <Stat label="Nama" value={profile.longName ?? profile.name ?? row?.name ?? "—"} />
              <Stat label="Sub sektor" value={profile.subSector ?? "—"} />
              <Stat label="Industri" value={profile.industry ?? "—"} />
              <Stat label="Papan" value={profile.board ?? "—"} />
              <Stat label="Tanggal listing" value={fmtDate(profile.listingDate) ?? "—"} />
              <Stat label="Karyawan" value={num(profile.employees, 0)} />
            </div>
            {profile.mainBusiness ? <p className="cek-business">{profile.mainBusiness}</p> : null}
            {detail?.profileError ? (
              <p className="field-hint">Catatan: sebagian profil gagal diambil ({detail.profileError}).</p>
            ) : null}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
