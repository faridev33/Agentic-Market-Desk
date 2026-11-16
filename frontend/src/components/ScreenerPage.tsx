import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, toApiError } from "../api";
import type {
  ApiError,
  FinancialPeriod,
  ScreenerDetail,
  ScreenerProgress,
  ScreenerResults,
  ScreenerRevenuePoint,
  ScreenerRow,
  ScreenerSortKey,
} from "../api";
import {
  fmtCompactMoney,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtPct,
  isNumber,
  relativeTime,
} from "../format";
import { StockChart } from "./StockChart";
import { Badge, Card, EmptyState, ErrorBanner, Section, SkeletonBlock } from "./ui";
import { DataUpdatedAt } from "./DataUpdatedAt";

const PAGE_SIZE = 50;
const FALLBACK_UNIVERSE = 956;

const SORT_OPTIONS: { value: ScreenerSortKey; label: string }[] = [
  { value: "marketCap", label: "Kapitalisasi pasar" },
  { value: "quality", label: "Skor fundamental" },
  { value: "change", label: "Perubahan harga" },
  { value: "price", label: "Harga saham" },
  { value: "pe", label: "P/E" },
  { value: "dividend", label: "Dividen" },
  { value: "revenue", label: "Pendapatan" },
  { value: "revenueGrowth", label: "Pertumbuhan pendapatan" },
  { value: "netIncome", label: "Laba bersih" },
  { value: "assets", label: "Total aset" },
  { value: "symbol", label: "Kode emiten (A-Z)" },
];

type FinancialFilter = "all" | "yes" | "no";

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 detik";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} detik`;
  return `${minutes} menit ${seconds} detik`;
}

function changeTone(value: number | null | undefined): "up" | "down" | "flat" {
  if (!isNumber(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function moneyOrDash(value: number | null | undefined): string {
  return isNumber(value) ? fmtCompactMoney(value) : "—";
}

function priceOrDash(value: number | null | undefined): string {
  return isNumber(value) ? fmtMoney(value, "IDR", 0) : "—";
}

function pctOrDash(value: number | null | undefined, digits = 2, signed = false): string {
  return isNumber(value) ? fmtPct(value, digits, signed) : "—";
}

function externalUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function statusMeta(status: ScreenerRow["dataStatus"]): {
  label: string;
  tone: "buy" | "warn" | "sell";
} {
  if (status === "complete") return { label: "Lengkap", tone: "buy" };
  if (status === "price_only") return { label: "Harga saja", tone: "warn" };
  return { label: "Kosong", tone: "sell" };
}

function TrendBars({ points }: { points: ScreenerRevenuePoint[] }) {
  const recent = points.slice(-3);
  const values = recent
    .map((point) => point.revenue)
    .filter((value): value is number => isNumber(value));
  if (values.length === 0) return <span className="screener-muted">—</span>;
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <span className="trend-bars" aria-label="Tren pendapatan tiga tahun terakhir">
      {recent.map((point) => {
        const height = isNumber(point.revenue)
          ? Math.max(10, Math.round((Math.abs(point.revenue) / max) * 100))
          : 8;
        return (
          <span
            key={point.fiscalYear}
            className={`trend-bar ${isNumber(point.revenue) ? "" : "is-empty"}`}
            style={{ height: `${height}%` }}
            title={`FY ${point.fiscalYear}: ${moneyOrDash(point.revenue)}`}
          />
        );
      })}
    </span>
  );
}

function YearlyRevenue({ row }: { row: ScreenerRow }) {
  const points = row.revenueTrend.slice(-3);

  if (points.length === 0) return <span className="screener-muted">—</span>;

  const first = points[0]?.revenue ?? null;
  const last = points[points.length - 1]?.revenue ?? null;
  const spanPct =
    isNumber(first) && isNumber(last) && first !== 0
      ? ((last - first) / Math.abs(first)) * 100
      : null;

  return (
    <span className="screener-years">
      {points.map((point) => (
        <span key={point.fiscalYear} className="screener-year-line">
          <em>FY{String(point.fiscalYear).slice(-2)}</em>
          <strong>{moneyOrDash(point.revenue)}</strong>
        </span>
      ))}
      <small className={`signed signed--${changeTone(spanPct)}`}>
        {isNumber(spanPct) ? `${pctOrDash(spanPct, 1, true)} dalam ${points.length} tahun` : "—"}
      </small>
    </span>
  );
}

export function ScreenerPage({ onAnalyze }: { onAnalyze: (symbol: string) => void }) {
  const [progress, setProgress] = useState<ScreenerProgress | null>(null);
  const [data, setData] = useState<ScreenerResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailRow, setDetailRow] = useState<ScreenerRow | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [queryInput, setQueryInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sector, setSector] = useState("");
  const [hasFinancials, setHasFinancials] = useState<FinancialFilter>("all");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [appliedPriceMin, setAppliedPriceMin] = useState<number | undefined>(undefined);
  const [appliedPriceMax, setAppliedPriceMax] = useState<number | undefined>(undefined);

  // Filter Kualitas, Bebas Rugi, Bebas Utang, Anti-Gorengan
  const [onlyProfitable, setOnlyProfitable] = useState(false);
  const [antiGorengan, setAntiGorengan] = useState(false);
  const [maxDerInput, setMaxDerInput] = useState("");
  const [minGrowthInput, setMinGrowthInput] = useState("");
  const [qualityVerdict, setQualityVerdict] = useState<"all" | "healthy" | "buy" | "watch" | "avoid">("all");

  const [sort, setSort] = useState<ScreenerSortKey>("marketCap");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const wasRunning = useRef(false);
  const isRunning = progress?.status === "running";
  const totalTarget = progress?.total ?? data?.summary.total ?? FALLBACK_UNIVERSE;
  const percent = Math.min(100, Math.max(0, progress?.percent ?? 0));

  useEffect(() => {
    let alive = true;
    void api
      .screenerStatus()
      .then((next) => {
        if (alive) setProgress(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(queryInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const min = priceMinInput.trim() !== "" ? Number(priceMinInput) : undefined;
      const max = priceMaxInput.trim() !== "" ? Number(priceMaxInput) : undefined;
      setAppliedPriceMin(isNumber(min) ? min : undefined);
      setAppliedPriceMax(isNumber(max) ? max : undefined);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [priceMinInput, priceMaxInput]);

  const parsedMaxDer = useMemo(() => {
    if (maxDerInput.trim() === "") return undefined;
    const num = Number(maxDerInput);
    return isNumber(num) ? num : undefined;
  }, [maxDerInput]);

  const parsedMinGrowth = useMemo(() => {
    if (minGrowthInput.trim() === "") return undefined;
    const num = Number(minGrowthInput);
    return isNumber(num) ? num : undefined;
  }, [minGrowthInput]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void api
      .screenerResults({
        q: appliedQuery || undefined,
        sector: sector || undefined,
        hasFinancials,
        priceMin: appliedPriceMin,
        priceMax: appliedPriceMax,
        onlyProfitable: onlyProfitable || undefined,
        antiGorengan: antiGorengan || undefined,
        maxDer: parsedMaxDer,
        minRevenueGrowth: parsedMinGrowth,
        qualityVerdict,
        sort,
        direction,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (!alive) return;
        setData(result);
        setProgress(result.progress);
        setError(null);
      })
      .catch((cause) => {
        if (!alive) return;
        setError(toApiError(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    appliedQuery,
    sector,
    hasFinancials,
    appliedPriceMin,
    appliedPriceMax,
    onlyProfitable,
    antiGorengan,
    parsedMaxDer,
    parsedMinGrowth,
    qualityVerdict,
    sort,
    direction,
    page,
    reloadKey,
  ]);

  useEffect(() => {
    if (!isRunning) {
      if (wasRunning.current) {
        wasRunning.current = false;
        setPage(1);
        setReloadKey((value) => value + 1);
      }
      return;
    }
    wasRunning.current = true;
    const poll = window.setInterval(() => {
      void api
        .screenerStatus()
        .then((next) => setProgress(next))
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(poll);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [isRunning]);

  const elapsedMs = useMemo(() => {
    if (isRunning && progress?.startedAt) {
      const started = Date.parse(progress.startedAt);
      if (Number.isFinite(started)) return Math.max(0, now - started);
    }
    return progress?.elapsedMs ?? 0;
  }, [isRunning, now, progress?.elapsedMs, progress?.startedAt]);

  const etaMs = useMemo(() => {
    if (!isRunning || percent <= 0 || percent >= 100) return null;
    return Math.round((elapsedMs * (100 - percent)) / percent);
  }, [elapsedMs, isRunning, percent]);

  const startScan = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const next = await api.startScreener();
      setProgress(next);
      wasRunning.current = next.status === "running";
      setNow(Date.now());
    } catch (cause) {
      setStartError(toApiError(cause).message);
    } finally {
      setStarting(false);
    }
  }, []);

  const retryResults = useCallback(() => {
    setError(null);
    setReloadKey((value) => value + 1);
  }, []);

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? null;
  const sectors = data?.sectors ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const currentPage = data?.page ?? page;
  const firstRow = data && data.rows.length > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  const resetFilters = useCallback(() => {
    setQueryInput("");
    setAppliedQuery("");
    setSector("");
    setHasFinancials("all");
    setPage(1);
  }, []);

  function handleSortChange(nextSort: ScreenerSortKey) {
    setSort(nextSort);
    setDirection(nextSort === "symbol" ? "asc" : "desc");
    setPage(1);
  }

  const isEmpty = data !== null && data.total === 0;
  const idleWithoutData = isEmpty && (progress?.status ?? "idle") === "idle";

  return (
    <div className="page-stack">
      <Section
        eyebrow="Screener Fundamental IDX"
        title="Pindai 900+ emiten Indonesia"
        aside={
          <div className="screener-actions">
            <button
              type="button"
              className="btn btn-primary screener-start"
              onClick={() => void startScan()}
              disabled={starting || isRunning}
            >
              {isRunning ? "Mengambil data..." : starting ? "Memulai..." : "Ambil data"}
            </button>
          </div>
        }
      >
        <Card className={`screener-hero ${isRunning ? "is-running" : ""}`}>
          <div className="screener-hero-top">
            <div className="screener-hero-copy">
              <h3>Satu klik untuk seluruh laporan keuangan IDX</h3>
              <p>
                Ambil harga saham terkini, pendapatan tahun ke tahun, beban pokok, laba
                usaha, laba bersih, neraca, arus kas, hingga profil perusahaan. Data
                disimpan di cache server agar tabel tetap cepat dibuka.
              </p>
            </div>
            <div className="screener-hero-badges">
              <Badge tone="info" dot>
                {totalTarget} emiten
              </Badge>
              <Badge tone="muted">Yahoo Finance</Badge>
              <Badge tone="muted">Laporan tahunan</Badge>
            </div>
          </div>

          <div className="screener-progress">
            <div className="screener-progress-head">
              <div>
                <span className="screener-progress-message">
                  {progress?.message ??
                    `Mengambil data kurang lebih ${totalTarget} emiten IDX. Tekan Ambil data untuk memulai.`}
                </span>
                <small>
                  {isRunning
                    ? `Fase ${progress?.phase === "quotes" ? "harga saham" : "laporan keuangan"} · berjalan ${fmtDuration(elapsedMs)} · ${
                        etaMs === null
                          ? "menghitung estimasi sisa..."
                          : `estimasi sisa ± ${fmtDuration(etaMs)}`
                      }`
                    : progress?.status === "complete" && progress.finishedAt
                      ? `Selesai 100% dalam ${fmtDuration(progress.elapsedMs)} · ${fmtDateTime(progress.finishedAt)}`
                      : progress?.snapshotAt
                        ? `Snapshot ${fmtDateTime(progress.snapshotAt)} · ${relativeTime(progress.snapshotAt)}`
                        : "Belum ada snapshot tersimpan"}
                </small>
              </div>
              <strong>{Math.round(percent)}%</strong>
            </div>
            <div
              className="screener-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              aria-label="Progres pengambilan data screener"
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="screener-progress-meta">
              <span>
                Harga <strong>{progress?.quoted ?? 0}</strong>/{totalTarget}
              </span>
              <span>
                Laporan <strong>{progress?.processed ?? 0}</strong>/{totalTarget}
              </span>
              <span>
                <strong>{progress?.withFinancials ?? 0}</strong> punya laporan
              </span>
              {progress && progress.failed > 0 ? (
                <span className="is-warn">
                  <strong>{progress.failed}</strong> gagal
                </span>
              ) : null}
              <span>Durasi {fmtDuration(elapsedMs)}</span>
              {isRunning ? (
                <span className="is-info">
                  Sisa ± {etaMs === null ? "menghitung..." : fmtDuration(etaMs)}
                </span>
              ) : progress?.status === "complete" ? (
                <span className="is-ok">Selesai 100% · {fmtDuration(progress.elapsedMs)}</span>
              ) : null}
            </div>
          </div>

          <p className="screener-note">
            Mengambil data kurang lebih {totalTarget} emiten IDX secara bertahap. Proses
            penuh biasanya beberapa menit; persentase dan durasi diperbarui otomatis.
            {progress?.status === "complete" && progress.finishedAt
              ? ` Pengambilan terakhir selesai dalam ${fmtDuration(progress.elapsedMs)}.`
              : ""}
          </p>

          {startError ? (
            <ErrorBanner
              title="Gagal memulai pengambilan data"
              message={startError}
              onRetry={() => void startScan()}
            />
          ) : null}
        </Card>

        <div className="screener-summary">
          <div className="summary-tile">
            <span>Emiten dimuat</span>
            <strong>{summary?.loaded ?? 0}</strong>
            <small>
              dari {summary?.total ?? totalTarget} emiten · {summary?.withFinancials ?? 0}{" "}
              punya laporan
            </small>
          </div>
          <div className="summary-tile">
            <span>Kapitalisasi pasar</span>
            <strong>{summary?.marketCap != null ? fmtCompactMoney(summary.marketCap) : "—"}</strong>
            <small>total emiten pada snapshot</small>
          </div>
          <div className="summary-tile summary-tile--buy">
            <span>Menguat / melemah</span>
            <strong>
              {summary?.gainers ?? 0} <span className="screener-slash">/</span>{" "}
              <span className="screener-down">{summary?.losers ?? 0}</span>
            </strong>
            <small>perubahan harga hari ini</small>
          </div>
          <div className="summary-tile">
            <span>Rata-rata perubahan</span>
            <strong className={`signed signed--${changeTone(summary?.averageChangePct)}`}>
              {pctOrDash(summary?.averageChangePct, 2, true)}
            </strong>
            <small>seluruh emiten termuat</small>
          </div>
        </div>

        <DataUpdatedAt
          timestamps={[
            { iso: progress?.snapshotAt, label: "Snapshot data" },
            { iso: progress?.finishedAt, label: "Scan selesai" },
            { iso: progress?.updatedAt, label: "Status terakhir" },
          ]}
        />

        <Card className="panel screener-panel">
          <div className="screener-controls">
            <label className="search-field screener-search">
              <span>Cari emiten, sektor, atau industri</span>
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="BBCA, bank, energi, batu bara..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <label className="field screener-filter">
              <span>Sektor</span>
              <select
                value={sector}
                onChange={(event) => {
                  setSector(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua sektor</option>
                {sectors.map((item) => (
                  <option key={item.sector} value={item.sector}>
                    {item.sector} ({item.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="field screener-filter">
              <span>Kelengkapan</span>
              <select
                value={hasFinancials}
                onChange={(event) => {
                  setHasFinancials(event.target.value as FinancialFilter);
                  setPage(1);
                }}
              >
                <option value="all">Semua emiten</option>
                <option value="yes">Punya laporan keuangan</option>
                <option value="no">Harga saja</option>
              </select>
            </label>

            <label className="field screener-filter">
              <span>Urutkan</span>
              <select
                value={sort}
                onChange={(event) => handleSortChange(event.target.value as ScreenerSortKey)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field screener-filter screener-direction">
              <span>Arah</span>
              <select
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as "asc" | "desc");
                  setPage(1);
                }}
              >
                <option value="desc">Menurun</option>
                <option value="asc">Menaik</option>
              </select>
            </label>
          </div>

          {/* Filter Khusus: Rentang Harga & Kualitas / Anti-Gorengan */}
          <div className="screener-advanced-filters">
            <div className="screener-filter-group price-filter-group">
              <span className="screener-filter-label">Rentang Harga (Rp):</span>
              <div className="screener-price-inputs">
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={priceMinInput}
                  onChange={(e) => setPriceMinInput(e.target.value)}
                  placeholder="Min (mis. 500)"
                  className="screener-mini-input"
                  title="Harga Minimum"
                />
                <span className="screener-hyphen">–</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={priceMaxInput}
                  onChange={(e) => setPriceMaxInput(e.target.value)}
                  placeholder="Max (mis. 5000)"
                  className="screener-mini-input"
                  title="Harga Maksimum"
                />
              </div>

              {/* Preset rentang harga cepat */}
              <div className="screener-presets">
                <button
                  type="button"
                  className={`chip ${priceMinInput === "500" && priceMaxInput === "5000" ? "is-active" : ""}`}
                  onClick={() => {
                    setPriceMinInput("500");
                    setPriceMaxInput("5000");
                  }}
                >
                  🎯 500 – 5.000
                </button>
                <button
                  type="button"
                  className={`chip ${priceMinInput === "1000" && priceMaxInput === "10000" ? "is-active" : ""}`}
                  onClick={() => {
                    setPriceMinInput("1000");
                    setPriceMaxInput("10000");
                  }}
                >
                  1.000 – 10.000
                </button>
                <button
                  type="button"
                  className={`chip ${priceMinInput === "5000" && priceMaxInput === "" ? "is-active" : ""}`}
                  onClick={() => {
                    setPriceMinInput("5000");
                    setPriceMaxInput("");
                  }}
                >
                  &gt; 5.000 (Bluechip)
                </button>
                {(priceMinInput !== "" || priceMaxInput !== "") && (
                  <button
                    type="button"
                    className="chip chip-clear"
                    onClick={() => {
                      setPriceMinInput("");
                      setPriceMaxInput("");
                    }}
                  >
                    Reset Harga ✕
                  </button>
                )}
              </div>
            </div>

            <div className="screener-filter-group quality-filter-group">
              <span className="screener-filter-label">Filter Kualitas &amp; Anti-Gorengan:</span>
              <div className="screener-toggles">
                <button
                  type="button"
                  className={`chip chip-highlight ${
                    antiGorengan && onlyProfitable && maxDerInput === "150" && qualityVerdict === "healthy"
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => {
                    const isAllOn =
                      antiGorengan && onlyProfitable && maxDerInput === "150" && qualityVerdict === "healthy";
                    if (isAllOn) {
                      setAntiGorengan(false);
                      setOnlyProfitable(false);
                      setMaxDerInput("");
                      setMinGrowthInput("");
                      setQualityVerdict("all");
                    } else {
                      setAntiGorengan(true);
                      setOnlyProfitable(true);
                      setMaxDerInput("150");
                      setMinGrowthInput("0");
                      setQualityVerdict("healthy");
                      if (priceMinInput === "" && priceMaxInput === "") {
                        setPriceMinInput("500");
                        setPriceMaxInput("5000");
                      }
                    }
                  }}
                >
                  🛡️ Mode Saham Sehat (One-Click)
                </button>

                <button
                  type="button"
                  className={`chip ${onlyProfitable ? "is-active" : ""}`}
                  onClick={() => setOnlyProfitable((v) => !v)}
                  title="Hanya tampilkan perusahaan yang laba bersihnya positif (menghindari emiten rugi)"
                >
                  {onlyProfitable ? "✓" : "+"} Bebas Rugi (Laba &gt; 0)
                </button>

                <button
                  type="button"
                  className={`chip ${antiGorengan ? "is-active" : ""}`}
                  onClick={() => setAntiGorengan((v) => !v)}
                  title="Hilangkan saham gorengan / penny stock mini / tidak likuid"
                >
                  {antiGorengan ? "✓" : "+"} Anti-Gorengan
                </button>

                <button
                  type="button"
                  className={`chip ${maxDerInput === "150" ? "is-active" : ""}`}
                  onClick={() => setMaxDerInput((v) => (v === "150" ? "" : "150"))}
                  title="Batasi utang perusahaan maksimal 150% ekuitas (menghindari perusahaan banyak hutang)"
                >
                  {maxDerInput === "150" ? "✓" : "+"} Utang Aman (DER ≤ 150%)
                </button>

                <button
                  type="button"
                  className={`chip ${minGrowthInput === "0" ? "is-active" : ""}`}
                  onClick={() => setMinGrowthInput((v) => (v === "0" ? "" : "0"))}
                  title="Hindari perusahaan yang pendapatan tahunannya menyusut tajam (YoY >= 0%)"
                >
                  {minGrowthInput === "0" ? "✓" : "+"} Pendapatan Tumbuh
                </button>

                <select
                  value={qualityVerdict}
                  onChange={(e) => {
                    setQualityVerdict(e.target.value as typeof qualityVerdict);
                    setPage(1);
                  }}
                  className="screener-select-mini"
                  title="Filter Predikat Kualitas Fundamental"
                >
                  <option value="all">Semua Kualitas</option>
                  <option value="healthy">Sehat (Beli &amp; Pantau)</option>
                  <option value="buy">Hanya Layak Beli</option>
                  <option value="watch">Hanya Pantau</option>
                </select>

                {(onlyProfitable ||
                  antiGorengan ||
                  maxDerInput !== "" ||
                  minGrowthInput !== "" ||
                  qualityVerdict !== "all" ||
                  priceMinInput !== "" ||
                  priceMaxInput !== "") && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-reset-all"
                    onClick={() => {
                      setPriceMinInput("");
                      setPriceMaxInput("");
                      setOnlyProfitable(false);
                      setAntiGorengan(false);
                      setMaxDerInput("");
                      setMinGrowthInput("");
                      setQualityVerdict("all");
                      setSector("");
                      setHasFinancials("all");
                      setQueryInput("");
                    }}
                  >
                    Reset Semua
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="screener-meta">
            <span>
              {data
                ? `${data.total.toLocaleString("id-ID")} emiten cocok · menampilkan ${
                    data.total === 0 ? 0 : firstRow
                  }-${lastRow}`
                : "Menunggu data screener"}
            </span>
            <span>
              {progress?.snapshotAt
                ? `Snapshot ${fmtDateTime(progress.snapshotAt)}`
                : "Belum ada snapshot"}
              {progress?.status === "running" ? " · memperbarui..." : ""}
            </span>
          </div>

          {error ? (
            <ErrorBanner
              title="Gagal memuat hasil screener"
              message={error.message}
              code={error.code}
              onRetry={retryResults}
            />
          ) : null}

          {loading && !data ? (
            <div className="screener-loading">
              <SkeletonBlock lines={10} />
            </div>
          ) : isRunning && rows.length === 0 ? (
            <div className="screener-loading">
              <SkeletonBlock lines={8} />
              <p className="screener-note">
                Data akan tampil otomatis setelah pengambilan selesai. Progres dan durasi
                diperbarui di panel atas.
              </p>
            </div>
          ) : idleWithoutData ? (
            <EmptyState
              kicker="Belum ada data"
              title="Ambil data screener terlebih dahulu"
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void startScan()}
                  disabled={starting || isRunning}
                >
                  Ambil data sekarang
                </button>
              }
            >
              <p>
                Tombol <strong>Ambil data</strong> akan memindai kurang lebih{" "}
                {totalTarget} emiten IDX. Progres, durasi, dan persentase tampil di atas.
              </p>
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState
              kicker="Tidak ada hasil"
              title="Tidak ada emiten yang cocok"
              action={
                <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                  Reset filter
                </button>
              }
            >
              <p>Ubah kata kunci, sektor, atau filter kelengkapan laporan keuangan.</p>
            </EmptyState>
          ) : (
            <div className="table-wrap screener-table-wrap">
              <table className="data-table screener-table">
                <thead>
                  <tr>
                    <th>Emiten</th>
                    <th>Sektor</th>
                    <th className="num">Harga</th>
                    <th className="num">Δ hari</th>
                    <th className="num">Kap. pasar</th>
                    <th className="num">P/E</th>
                    <th className="num">Pendapatan per tahun</th>
                    <th className="num">YoY</th>
                    <th className="num">Beban pokok</th>
                    <th className="num">Laba kotor</th>
                    <th className="num">Laba usaha</th>
                    <th className="num">Laba bersih</th>
                    <th className="num">Aset</th>
                    <th>Tentang perusahaan</th>
                    <th className="num">Tren</th>
                    <th aria-label="Aksi" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tone = changeTone(row.changePct);
                    const status = statusMeta(row.dataStatus);
                    return (
                      <tr key={row.symbol} className="screener-row">
                        <td>
                          <button
                            type="button"
                            className="stock-cell stock-cell--button"
                            onClick={() => setDetailRow(row)}
                          >
                            <span className="stock-line">
                              <span className="stock-symbol">{row.code}</span>
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </span>
                            <span className="stock-name">{row.name}</span>
                          </button>
                        </td>
                        <td>
                          <span className="tag">{row.sector ?? "Lainnya"}</span>
                        </td>
                        <td className="num">{priceOrDash(row.price)}</td>
                        <td className={`num signed signed--${tone}`}>
                          {pctOrDash(row.changePct, 2, true)}
                        </td>
                        <td className="num">{moneyOrDash(row.marketCap)}</td>
                        <td className="num">
                          {isNumber(row.trailingPE) ? fmtNumber(row.trailingPE, 2) : "—"}
                        </td>
                        <td className="num">
                          <YearlyRevenue row={row} />
                        </td>
                        <td className={`num signed signed--${changeTone(row.financials?.revenueGrowthPct)}`}>
                          {pctOrDash(row.financials?.revenueGrowthPct, 1, true)}
                        </td>
                        <td className="num">{moneyOrDash(row.financials?.costOfRevenue)}</td>
                        <td className="num">{moneyOrDash(row.financials?.grossProfit)}</td>
                        <td className="num">{moneyOrDash(row.financials?.operatingIncome)}</td>
                        <td className={`num ${isNumber(row.financials?.netIncome) && row.financials.netIncome < 0 ? "screener-negative" : ""}`}>
                          {moneyOrDash(row.financials?.netIncome)}
                        </td>
                        <td className="num">{moneyOrDash(row.financials?.totalAssets)}</td>
                        <td>
                          <span className="screener-about">
                            {row.board ? <span className="tag">{row.board}</span> : null}
                            <span
                              className="screener-about-text"
                              title={row.mainBusiness ?? undefined}
                            >
                              {row.mainBusiness ?? row.subSector ?? "—"}
                            </span>
                            {row.listingDate ? (
                              <small className="screener-fy">
                                Listing {fmtDate(row.listingDate)}
                              </small>
                            ) : null}
                          </span>
                        </td>
                        <td className="num">
                          <TrendBars points={row.revenueTrend} />
                        </td>
                        <td className="num">
                          <span className="screener-row-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setDetailRow(row)}
                            >
                              Detail
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm screener-open"
                              onClick={() => onAnalyze(row.symbol)}
                            >
                              Analisa
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && rows.length > 0 ? (
            <div className="screener-pager">
              <span className="screener-pager-info">
                Halaman {currentPage} dari {pageCount} · {data.total.toLocaleString("id-ID")}{" "}
                emiten
              </span>
              <div className="screener-pager-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1 || loading}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage >= pageCount || loading}
                >
                  Berikutnya
                </button>
              </div>
            </div>
          ) : null}

          <footer className="panel-foot">
            <span>
              Harga dan laporan keuangan Yahoo Finance dalam Rupiah · data disimpan di cache
              server
            </span>
            <span>Bursa Efek Indonesia · {totalTarget} emiten</span>
          </footer>
        </Card>
      </Section>

      {detailRow ? (
        <ScreenerDetailDrawer
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onAnalyze={(symbol) => {
            setDetailRow(null);
            onAnalyze(symbol);
          }}
        />
      ) : null}
    </div>
  );
}

function ScreenerDetailDrawer({
  row,
  onClose,
  onAnalyze,
}: {
  row: ScreenerRow;
  onClose: () => void;
  onAnalyze: (symbol: string) => void;
}) {
  const [detail, setDetail] = useState<ScreenerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    setError(null);
    void api
      .screenerDetail(row.symbol)
      .then((result) => {
        if (alive) setDetail(result);
      })
      .catch((cause) => {
        if (alive) setError(toApiError(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [row.symbol]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const currentRow = detail?.row ?? row;
  const profile = detail?.profile ?? null;
  const keyStats = detail?.keyStats ?? null;
  const website = externalUrl(profile?.website ?? null);
  const tone = changeTone(currentRow.changePct);
  const currentStatus = statusMeta(currentRow.dataStatus);

  return (
    <div className="screener-overlay" role="presentation" onClick={onClose}>
      <aside
        className="screener-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detail ${row.code}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="screener-drawer-head">
          <div className="screener-drawer-title">
            <div className="screener-drawer-code">
              <span className="stock-symbol">{currentRow.code}</span>
              <Badge tone={currentStatus.tone}>{currentStatus.label}</Badge>
              <span className="tag">{currentRow.sector ?? profile?.sector ?? "Lainnya"}</span>
            </div>
            <h3>{profile?.name ?? currentRow.name}</h3>
            <p>
              {profile?.subSector ?? currentRow.subSector ?? "—"}
              {profile?.industry ? ` · ${profile.industry}` : ""}
            </p>
          </div>
          <div className="screener-drawer-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onAnalyze(currentRow.symbol)}
            >
              Analisa saham
            </button>
            <button
              type="button"
              className="screener-close"
              onClick={onClose}
              aria-label="Tutup detail"
            >
              ×
            </button>
          </div>
        </header>

        <div className="screener-drawer-body">
          <div className="screener-drawer-price">
            <div>
              <span>Harga terakhir</span>
              <strong>{priceOrDash(currentRow.price)}</strong>
            </div>
            <div>
              <span>Perubahan hari ini</span>
              <strong className={`signed signed--${tone}`}>
                {pctOrDash(currentRow.changePct, 2, true)}
              </strong>
            </div>
            <div>
              <span>Kapitalisasi pasar</span>
              <strong>{moneyOrDash(currentRow.marketCap)}</strong>
            </div>
            <div>
              <span>P/E · P/B</span>
              <strong>
                {isNumber(currentRow.trailingPE) ? fmtNumber(currentRow.trailingPE, 2) : "—"} ·{" "}
                {isNumber(currentRow.priceToBook) ? fmtNumber(currentRow.priceToBook, 2) : "—"}
              </strong>
            </div>
            <div>
              <span>Dividen</span>
              <strong>{pctOrDash(currentRow.dividendYieldPct, 2)}</strong>
            </div>
            <div>
              <span>EPS</span>
              <strong>{priceOrDash(currentRow.eps)}</strong>
            </div>
          </div>

          {/* Grafik Saham Interaktif Candlestick */}
          <div className="screener-drawer-chart">
            <StockChart
              symbol={currentRow.symbol}
              name={profile?.name ?? currentRow.name}
              currentPrice={currentRow.price}
              changePct={currentRow.changePct}
              height={290}
            />
          </div>

          {error ? (
            <ErrorBanner
              title="Gagal memuat detail perusahaan"
              message={error.message}
              code={error.code}
              onRetry={() => {
                setError(null);
                setLoading(true);
                void api
                  .screenerDetail(row.symbol)
                  .then((result) => {
                    setDetail(result);
                    setError(null);
                  })
                  .catch((cause) => setError(toApiError(cause)))
                  .finally(() => setLoading(false));
              }}
            />
          ) : null}

          {loading ? (
            <div className="screener-loading">
              <SkeletonBlock lines={12} />
            </div>
          ) : detail ? (
            <>
              {detail.profileError ? (
                <p className="callout callout--warn">
                  Profil Yahoo Finance tidak lengkap: {detail.profileError}. Data statis IDX
                  tetap ditampilkan.
                </p>
              ) : null}

              <section className="drawer-section">
                <h4>Informasi perusahaan</h4>
                <div className="detail-fields">
                  <DetailField label="Kode" value={profile?.code ?? currentRow.code} />
                  <DetailField label="Papan pencatatan" value={profile?.board} />
                  <DetailField label="Tanggal listing" value={fmtDate(profile?.listingDate)} />
                  <DetailField label="Sektor" value={profile?.sector} />
                  <DetailField label="Subsektor" value={profile?.subSector} />
                  <DetailField label="Industri" value={profile?.industry} />
                  <DetailField label="Subindustri" value={profile?.subIndustry} />
                  <DetailField
                    label="Jumlah karyawan"
                    value={isNumber(profile?.employees) ? fmtNumber(profile.employees, 0) : null}
                  />
                  <DetailField label="Sekretaris" value={profile?.secretary} />
                  <DetailField
                    label="Telepon"
                    value={profile?.phone ? <a href={`tel:${profile.phone}`}>{profile.phone}</a> : null}
                  />
                  <DetailField
                    label="Email"
                    value={
                      profile?.email ? (
                        <a href={`mailto:${profile.email}`}>{profile.email}</a>
                      ) : null
                    }
                  />
                  <DetailField
                    label="Website"
                    value={website ? <a href={website} target="_blank" rel="noreferrer">{profile?.website}</a> : null}
                  />
                  <DetailField
                    label="Alamat"
                    value={profile?.address}
                    className="detail-field--wide detail-address"
                  />
                </div>
              </section>

              {profile?.description || profile?.mainBusiness ? (
                <section className="drawer-section">
                  <h4>Profil dan kegiatan usaha</h4>
                  {profile?.mainBusiness ? (
                    <p className="detail-text">
                      <strong>Kegiatan usaha utama:</strong> {profile.mainBusiness}
                    </p>
                  ) : null}
                  {profile?.description ? (
                    <p className="detail-text">{profile.description}</p>
                  ) : null}
                </section>
              ) : null}

              <section className="drawer-section">
                <h4>Statistik kunci</h4>
                {keyStats ? (
                  <div className="detail-stats">
                    <DetailStat label="Kap. pasar" value={moneyOrDash(keyStats.marketCap)} />
                    <DetailStat label="Enterprise value" value={moneyOrDash(keyStats.enterpriseValue)} />
                    <DetailStat label="P/E" value={isNumber(keyStats.trailingPE) ? fmtNumber(keyStats.trailingPE, 2) : "—"} />
                    <DetailStat label="P/E forward" value={isNumber(keyStats.forwardPE) ? fmtNumber(keyStats.forwardPE, 2) : "—"} />
                    <DetailStat label="P/B" value={isNumber(keyStats.priceToBook) ? fmtNumber(keyStats.priceToBook, 2) : "—"} />
                    <DetailStat label="EV/EBITDA" value={isNumber(keyStats.evToEbitda) ? fmtNumber(keyStats.evToEbitda, 2) : "—"} />
                    <DetailStat label="PEG" value={isNumber(keyStats.pegRatio) ? fmtNumber(keyStats.pegRatio, 2) : "—"} />
                    <DetailStat label="Dividen" value={pctOrDash(keyStats.dividendYieldPct, 2)} />
                    <DetailStat label="Beta" value={isNumber(keyStats.beta) ? fmtNumber(keyStats.beta, 2) : "—"} />
                    <DetailStat label="Saham beredar" value={moneyOrDash(keyStats.sharesOutstanding)} />
                    <DetailStat label="Float" value={moneyOrDash(keyStats.floatShares)} />
                    <DetailStat label="ROE" value={pctOrDash(keyStats.returnOnEquityPct, 2)} />
                    <DetailStat label="ROA" value={pctOrDash(keyStats.returnOnAssetsPct, 2)} />
                    <DetailStat label="Margin kotor" value={pctOrDash(keyStats.grossMarginPct, 2)} />
                    <DetailStat label="Margin usaha" value={pctOrDash(keyStats.operatingMarginPct, 2)} />
                    <DetailStat label="Margin laba" value={pctOrDash(keyStats.profitMarginPct, 2)} />
                    <DetailStat label="Debt/Equity" value={pctOrDash(keyStats.debtToEquityPct, 2)} />
                    <DetailStat label="Current ratio" value={isNumber(keyStats.currentRatio) ? fmtNumber(keyStats.currentRatio, 2) : "—"} />
                    <DetailStat label="Kas" value={moneyOrDash(keyStats.totalCash)} />
                    <DetailStat label="Total utang" value={moneyOrDash(keyStats.totalDebt)} />
                    <DetailStat label="Pendapatan" value={moneyOrDash(keyStats.revenue)} />
                    <DetailStat label="Growth pendapatan" value={pctOrDash(keyStats.revenueGrowthPct, 2, true)} />
                    <DetailStat label="Growth laba" value={pctOrDash(keyStats.earningsGrowthPct, 2, true)} />
                    <DetailStat label="Arus kas operasi" value={moneyOrDash(keyStats.operatingCashflow)} />
                    <DetailStat label="Arus kas bebas" value={moneyOrDash(keyStats.freeCashflow)} />
                    <DetailStat label="Akhir tahun fiskal" value={fmtDate(keyStats.fiscalYearEnd)} />
                  </div>
                ) : (
                  <p className="callout">
                    Statistik kunci Yahoo Finance belum tersedia. Ringkasan laporan keuangan
                    tetap ditampilkan di bawah.
                  </p>
                )}
              </section>

              <section className="drawer-section">
                <h4>Laporan keuangan tahunan</h4>
                <FinancialTable periods={detail.financials} />
              </section>

              {profile && (profile.directors.length > 0 || profile.commissioners.length > 0 || profile.officers.length > 0) ? (
                <section className="drawer-section">
                  <h4>Manajemen</h4>
                  <div className="detail-people">
                    <PeopleList
                      title="Direksi"
                      people={profile.directors.length > 0 ? profile.directors : profile.officers}
                    />
                    <PeopleList title="Komisaris" people={profile.commissioners} />
                  </div>
                </section>
              ) : null}

              {profile && profile.shareholders.length > 0 ? (
                <section className="drawer-section">
                  <h4>Pemegang saham</h4>
                  <div className="table-wrap">
                    <table className="data-table detail-shareholder-table">
                      <thead>
                        <tr>
                          <th>Nama</th>
                          <th className="num">Persentase</th>
                          <th>Pengendali</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.shareholders.map((shareholder) => (
                          <tr key={shareholder.name}>
                            <td>{shareholder.name}</td>
                            <td className="num">{pctOrDash(shareholder.percentage, 2)}</td>
                            <td>{shareholder.controlling ? "Ya" : "Tidak"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <p className="screener-note screener-note--drawer">
                Detail diambil {fmtDateTime(detail.fetchedAt)}. Data profil berasal dari
                snapshot IDX dan diperkaya Yahoo Finance. Bukan nasihat keuangan.
              </p>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={`detail-field ${className}`.trim()}>
      <span>{label}</span>
      <strong>{empty ? "—" : value}</strong>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PeopleList({
  title,
  people,
}: {
  title: string;
  people: { name: string; title: string | null }[];
}) {
  return (
    <div className="people-list">
      <h5>{title}</h5>
      {people.length === 0 ? (
        <p className="screener-muted">Belum ada data.</p>
      ) : (
        <ul>
          {people.map((person) => (
            <li key={`${person.name}-${person.title ?? ""}`}>
              <strong>{person.name}</strong>
              <span>{person.title ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FinancialTable({ periods }: { periods: FinancialPeriod[] }) {
  if (periods.length === 0) {
    return (
      <p className="callout">
        Laporan keuangan tahunan belum tersedia untuk emiten ini. Harga dan profil tetap
        dapat dilihat.
      </p>
    );
  }

  const rows: {
    label: string;
    value: (period: FinancialPeriod) => string;
    tone?: (period: FinancialPeriod) => string;
  }[] = [
    {
      label: "Pendapatan",
      value: (period) => moneyOrDash(period.totalRevenue ?? period.operatingRevenue),
    },
    { label: "Beban pokok", value: (period) => moneyOrDash(period.costOfRevenue) },
    { label: "Laba kotor", value: (period) => moneyOrDash(period.grossProfit) },
    { label: "Beban usaha", value: (period) => moneyOrDash(period.operatingExpense) },
    { label: "Laba usaha", value: (period) => moneyOrDash(period.operatingIncome) },
    { label: "EBITDA", value: (period) => moneyOrDash(period.ebitda) },
    {
      label: "Laba bersih",
      value: (period) => moneyOrDash(period.netIncome),
      tone: (period) =>
        isNumber(period.netIncome) && period.netIncome < 0 ? "screener-negative" : "",
    },
    { label: "Margin kotor", value: (period) => pctOrDash(period.grossMarginPct, 1) },
    { label: "Margin usaha", value: (period) => pctOrDash(period.operatingMarginPct, 1) },
    { label: "Margin bersih", value: (period) => pctOrDash(period.netMarginPct, 1) },
    {
      label: "Pertumbuhan pendapatan",
      value: (period) => pctOrDash(period.revenueGrowthPct, 1, true),
      tone: (period) =>
        isNumber(period.revenueGrowthPct) && period.revenueGrowthPct < 0
          ? "screener-negative"
          : "",
    },
    {
      label: "Pertumbuhan laba",
      value: (period) => pctOrDash(period.netIncomeGrowthPct, 1, true),
      tone: (period) =>
        isNumber(period.netIncomeGrowthPct) && period.netIncomeGrowthPct < 0
          ? "screener-negative"
          : "",
    },
    { label: "Total aset", value: (period) => moneyOrDash(period.totalAssets) },
    { label: "Total liabilitas", value: (period) => moneyOrDash(period.totalLiabilities) },
    { label: "Ekuitas", value: (period) => moneyOrDash(period.stockholdersEquity) },
    { label: "Kas dan setara kas", value: (period) => moneyOrDash(period.cashAndCashEquivalents) },
    { label: "Total utang", value: (period) => moneyOrDash(period.totalDebt) },
    { label: "Arus kas operasi", value: (period) => moneyOrDash(period.operatingCashFlow) },
    { label: "Arus kas bebas", value: (period) => moneyOrDash(period.freeCashFlow) },
    {
      label: "Belanja modal",
      value: (period) => moneyOrDash(period.capitalExpenditure),
    },
    {
      label: "EPS dasar",
      value: (period) => (isNumber(period.basicEPS) ? fmtMoney(period.basicEPS, "IDR", 0) : "—"),
    },
  ];

  return (
    <div className="table-wrap detail-fin-wrap">
      <table className="data-table detail-fin-table">
        <thead>
          <tr>
            <th>Pos laporan</th>
            {periods.map((period) => (
              <th key={period.fiscalYear} className="num">
                FY {period.fiscalYear}
                <small className="screener-fy">{fmtDate(period.periodEnd)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.label}>
              <td>{line.label}</td>
              {periods.map((period) => (
                <td
                  key={`${line.label}-${period.fiscalYear}`}
                  className={`num ${line.tone ? line.tone(period) : ""}`.trim()}
                >
                  {line.value(period)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
