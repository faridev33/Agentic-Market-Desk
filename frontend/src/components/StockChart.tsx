import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, toApiError } from "../api";
import type { Candle, PriceSeries } from "../api";
import { fmtCompactMoney, fmtMoney, fmtNumber, fmtPct, isNumber } from "../format";
import { Badge, Card, Spinner } from "./ui";

interface StockChartProps {
  symbol: string;
  name?: string | null;
  currentPrice?: number | null;
  changePct?: number | null;
  className?: string;
  height?: number;
}

type RangeOption = "1mo" | "3mo" | "6mo" | "1y" | "2y";
type ChartMode = "candle" | "line";

const RANGES: { value: RangeOption; label: string }[] = [
  { value: "1mo", label: "1B" },
  { value: "3mo", label: "3B" },
  { value: "6mo", label: "6B" },
  { value: "1y", label: "1T" },
  { value: "2y", label: "2T" },
];

function calculateSMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i]?.close ?? 0;
    if (i >= period) {
      sum -= candles[i - period]?.close ?? 0;
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

function calculateRSI(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const prev = candles[i - 1]?.close ?? 0;
    const curr = candles[i]?.close ?? 0;
    const diff = curr - prev;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < candles.length; i++) {
    const prev = candles[i - 1]?.close ?? 0;
    const curr = candles[i]?.close ?? 0;
    const diff = curr - prev;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAxisDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export function StockChart({
  symbol,
  name,
  currentPrice,
  className = "",
  height = 360,
}: StockChartProps) {
  const [range, setRange] = useState<RangeOption>("6mo");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [showMA20, setShowMA20] = useState(true);
  const [showMA50, setShowMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  const [series, setSeries] = useState<PriceSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load candle data
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.history(symbol, { range, interval: "1d" });
      setSeries(data);
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setLoading(false);
    }
  }, [symbol, range]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const candles = useMemo(() => series?.candles ?? [], [series]);

  // Calculations: SMA & Indicators
  const ma20Values = useMemo(() => calculateSMA(candles, 20), [candles]);
  const ma50Values = useMemo(() => calculateSMA(candles, 50), [candles]);
  const rsiValue = useMemo(() => calculateRSI(candles, 14), [candles]);

  // Active candle to show stats for (hovered or last)
  const activeCandle = useMemo(() => {
    if (candles.length === 0) return null;
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length) {
      return candles[hoverIndex] ?? null;
    }
    return candles[candles.length - 1] ?? null;
  }, [candles, hoverIndex]);

  const activeIndex = useMemo(() => {
    if (candles.length === 0) return -1;
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length) {
      return hoverIndex;
    }
    return candles.length - 1;
  }, [candles, hoverIndex]);

  // Metrics for active candle
  const activeChange = useMemo(() => {
    if (!activeCandle) return { diff: 0, pct: 0 };
    const diff = activeCandle.close - activeCandle.open;
    const pct = activeCandle.open > 0 ? (diff / activeCandle.open) * 100 : 0;
    return { diff, pct };
  }, [activeCandle]);

  // Trend analysis
  const trendInfo = useMemo(() => {
    if (candles.length < 5) return null;
    const last = candles[candles.length - 1]?.close ?? 0;
    const ma20 = ma20Values[ma20Values.length - 1];
    const ma50 = ma50Values[ma50Values.length - 1];

    let trend: "Bullish" | "Bearish" | "Netral" = "Netral";
    let tone: "up" | "down" | "flat" = "flat";

    if (ma20 !== null && last > ma20) {
      trend = "Bullish";
      tone = "up";
    } else if (ma20 !== null && last < ma20) {
      trend = "Bearish";
      tone = "down";
    }

    return {
      trend,
      tone,
      ma20,
      ma50,
      diffMa20Pct: ma20 ? ((last - ma20) / ma20) * 100 : null,
      diffMa50Pct: ma50 ? ((last - ma50) / ma50) * 100 : null,
    };
  }, [candles, ma20Values, ma50Values]);

  // Dimensions & Scale
  const padding = { top: 24, right: 64, bottom: 44, left: 14 };
  const width = 800; // SVG viewBox coordinate system
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const volumeHeight = showVolume ? Math.min(65, innerHeight * 0.22) : 0;
  const priceHeight = innerHeight - (showVolume ? volumeHeight + 16 : 0);

  // Price range calculation
  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: 0, maxPrice: 100, maxVolume: 100 };
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let maxVol = 0;

    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    }

    // Include MAs in price boundary if enabled
    if (showMA20) {
      for (const v of ma20Values) {
        if (v !== null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (showMA50) {
      for (const v of ma50Values) {
        if (v !== null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }

    const margin = (max - min) * 0.06 || max * 0.05 || 10;
    return {
      minPrice: Math.max(0, min - margin),
      maxPrice: max + margin,
      maxVolume: maxVol * 1.15 || 1,
    };
  }, [candles, ma20Values, ma50Values, showMA20, showMA50]);

  // Coordinates mapping
  const count = candles.length;
  const step = count > 1 ? innerWidth / (count - 1) : innerWidth;
  const barWidth = Math.max(2, Math.min(16, (innerWidth / Math.max(1, count)) * 0.7));

  const getX = useCallback(
    (index: number) => padding.left + index * step,
    [padding.left, step],
  );

  const getY = useCallback(
    (price: number) => {
      const span = maxPrice - minPrice;
      if (span <= 0) return padding.top + priceHeight / 2;
      const ratio = (price - minPrice) / span;
      return padding.top + priceHeight * (1 - ratio);
    },
    [maxPrice, minPrice, padding.top, priceHeight],
  );

  const getVolY = useCallback(
    (vol: number) => {
      const top = padding.top + priceHeight + 16;
      if (maxVolume <= 0) return top + volumeHeight;
      const ratio = vol / maxVolume;
      return top + volumeHeight * (1 - ratio);
    },
    [maxVolume, padding.top, priceHeight, volumeHeight],
  );

  // Price axis ticks
  const priceTicks = useMemo(() => {
    const ticks: number[] = [];
    const count = 5;
    const step = (maxPrice - minPrice) / count;
    for (let i = 0; i <= count; i++) {
      ticks.push(minPrice + i * step);
    }
    return ticks;
  }, [minPrice, maxPrice]);

  // Date axis ticks (up to 6 dates evenly distributed)
  const dateTicks = useMemo(() => {
    if (candles.length === 0) return [];
    const tickIndices: number[] = [];
    const targetTicks = Math.min(6, candles.length);
    const step = (candles.length - 1) / (targetTicks - 1 || 1);
    for (let i = 0; i < targetTicks; i++) {
      tickIndices.push(Math.round(i * step));
    }
    return tickIndices;
  }, [candles]);

  // Mouse interaction
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || candles.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = width / rect.width;
    const chartX = mouseX * scaleX - padding.left;

    const rawIndex = Math.round(chartX / step);
    const clampedIndex = Math.max(0, Math.min(candles.length - 1, rawIndex));
    setHoverIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Generate SVG path for line chart
  const linePath = useMemo(() => {
    if (candles.length === 0) return "";
    return candles
      .map((c, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(c.close).toFixed(1)}`)
      .join(" ");
  }, [candles, getX, getY]);

  const lineAreaPath = useMemo(() => {
    if (candles.length === 0) return "";
    const firstX = getX(0).toFixed(1);
    const lastX = getX(candles.length - 1).toFixed(1);
    const bottomY = (padding.top + priceHeight).toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [candles.length, getX, linePath, padding.top, priceHeight]);

  // Generate SVG path for Moving Averages
  const ma20Path = useMemo(() => {
    if (!showMA20 || candles.length === 0) return "";
    const points: string[] = [];
    for (let i = 0; i < candles.length; i++) {
      const val = ma20Values[i];
      if (val !== null && val !== undefined) {
        points.push(`${points.length === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`);
      }
    }
    return points.join(" ");
  }, [showMA20, candles, ma20Values, getX, getY]);

  const ma50Path = useMemo(() => {
    if (!showMA50 || candles.length === 0) return "";
    const points: string[] = [];
    for (let i = 0; i < candles.length; i++) {
      const val = ma50Values[i];
      if (val !== null && val !== undefined) {
        points.push(`${points.length === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(val).toFixed(1)}`);
      }
    }
    return points.join(" ");
  }, [showMA50, candles, ma50Values, getX, getY]);

  const displayPrice = activeCandle ? activeCandle.close : currentPrice;
  const isUp = activeChange.diff >= 0;

  return (
    <Card className={`stock-chart-card ${className}`}>
      {/* Chart Top Header */}
      <div className="stock-chart-header">
        <div className="stock-chart-title-group">
          <div className="stock-chart-symbol-line">
            <h3 className="stock-chart-symbol">{symbol.replace(/\.JK$/i, "")}</h3>
            {name ? <span className="stock-chart-name">{name}</span> : null}
            {trendInfo ? (
              <Badge tone={trendInfo.tone === "up" ? "buy" : trendInfo.tone === "down" ? "sell" : "info"}>
                Tren {trendInfo.trend}
              </Badge>
            ) : null}
            {rsiValue !== null ? (
              <span className={`stock-chart-rsi-tag ${rsiValue < 30 ? "is-oversold" : rsiValue > 70 ? "is-overbought" : ""}`}>
                RSI: {rsiValue} {rsiValue < 30 ? "(Oversold)" : rsiValue > 70 ? "(Overbought)" : ""}
              </span>
            ) : null}
          </div>

          <div className="stock-chart-price-line">
            <span className="stock-chart-price">
              {isNumber(displayPrice) ? fmtMoney(displayPrice, "IDR", 0) : "—"}
            </span>
            <span className={`stock-chart-change signed signed--${isUp ? "up" : "down"}`}>
              {isUp ? "+" : ""}
              {fmtMoney(activeChange.diff, "IDR", 0)} ({isUp ? "+" : ""}
              {fmtPct(activeChange.pct, 2)})
            </span>
            <span className="stock-chart-date-label">
              {activeCandle ? formatDate(activeCandle.date) : "Memuat data harga…"}
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="stock-chart-toolbar">
          <div className="stock-chart-ranges">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`stock-chart-btn ${range === r.value ? "is-active" : ""}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="stock-chart-tools">
            <button
              type="button"
              className={`stock-chart-btn ${chartMode === "candle" ? "is-active" : ""}`}
              onClick={() => setChartMode("candle")}
              title="Grafik Candlestick"
            >
              🕯️ Lilin
            </button>
            <button
              type="button"
              className={`stock-chart-btn ${chartMode === "line" ? "is-active" : ""}`}
              onClick={() => setChartMode("line")}
              title="Grafik Garis"
            >
              📈 Garis
            </button>
            <button
              type="button"
              className={`stock-chart-btn ${showMA20 ? "is-active is-ma20" : ""}`}
              onClick={() => setShowMA20((v) => !v)}
              title="Toggle Rata-Rata Bergerak 20 Hari (MA 20)"
            >
              MA20
            </button>
            <button
              type="button"
              className={`stock-chart-btn ${showMA50 ? "is-active is-ma50" : ""}`}
              onClick={() => setShowMA50((v) => !v)}
              title="Toggle Rata-Rata Bergerak 50 Hari (MA 50)"
            >
              MA50
            </button>
            <button
              type="button"
              className={`stock-chart-btn ${showVolume ? "is-active" : ""}`}
              onClick={() => setShowVolume((v) => !v)}
              title="Toggle Histogram Volume"
            >
              Vol
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar (OHLCV) */}
      {activeCandle ? (
        <div className="stock-chart-ohlc-bar">
          <span className="ohlc-item">
            <em>O:</em> <strong>{fmtNumber(activeCandle.open, 0)}</strong>
          </span>
          <span className="ohlc-item">
            <em>H:</em> <strong>{fmtNumber(activeCandle.high, 0)}</strong>
          </span>
          <span className="ohlc-item">
            <em>L:</em> <strong>{fmtNumber(activeCandle.low, 0)}</strong>
          </span>
          <span className="ohlc-item">
            <em>C:</em> <strong>{fmtNumber(activeCandle.close, 0)}</strong>
          </span>
          <span className="ohlc-item">
            <em>Vol:</em> <strong>{fmtCompactMoney(activeCandle.volume).replace("IDR", "").trim()}</strong>
          </span>
          {showMA20 && activeIndex >= 0 && ma20Values[activeIndex] !== null ? (
            <span className="ohlc-item ohlc-ma20">
              <em>MA20:</em> <strong>{fmtNumber(ma20Values[activeIndex], 0)}</strong>
            </span>
          ) : null}
          {showMA50 && activeIndex >= 0 && ma50Values[activeIndex] !== null ? (
            <span className="ohlc-item ohlc-ma50">
              <em>MA50:</em> <strong>{fmtNumber(ma50Values[activeIndex], 0)}</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Main Chart Canvas / SVG */}
      <div className="stock-chart-viewport" ref={containerRef}>
        {loading && candles.length === 0 ? (
          <div className="stock-chart-loading" style={{ height }}>
            <Spinner />
            <span>Memuat pergerakan candle saham {symbol}…</span>
          </div>
        ) : error ? (
          <div className="stock-chart-empty" style={{ height }}>
            <p>Gagal memuat grafik: {error}</p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void loadHistory()}>
              Coba Lagi
            </button>
          </div>
        ) : candles.length === 0 ? (
          <div className="stock-chart-empty" style={{ height }}>
            <p>Data candle tidak tersedia untuk {symbol}.</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="stock-chart-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="stockLineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines & Price Labels */}
            {priceTicks.map((p) => {
              const y = getY(p);
              return (
                <g key={p}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    className="stock-chart-grid"
                  />
                  <text
                    x={width - padding.right + 8}
                    y={y + 3.5}
                    className="stock-chart-tick-label"
                  >
                    {fmtNumber(p, 0)}
                  </text>
                </g>
              );
            })}

            {/* Volume Grid separator if enabled */}
            {showVolume ? (
              <g>
                <line
                  x1={padding.left}
                  y1={padding.top + priceHeight + 12}
                  x2={width - padding.right}
                  y2={padding.top + priceHeight + 12}
                  className="stock-chart-separator"
                />
                <text
                  x={width - padding.right + 8}
                  y={padding.top + priceHeight + 24}
                  className="stock-chart-tick-label stock-chart-vol-label"
                >
                  Vol
                </text>
              </g>
            ) : null}

            {/* Volume Histogram Bars */}
            {showVolume &&
              candles.map((c, i) => {
                const x = getX(i) - barWidth / 2;
                const y = getVolY(c.volume);
                const h = Math.max(1, padding.top + priceHeight + 16 + volumeHeight - y);
                const barColor = c.close >= c.open ? "var(--buy, #10b981)" : "var(--sell, #ef4444)";
                return (
                  <rect
                    key={`vol-${c.date}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={barColor}
                    opacity={activeIndex === i ? 0.75 : 0.35}
                  />
                );
              })}

            {/* Price Line & Gradient Area (when in line mode) */}
            {chartMode === "line" && (
              <>
                <path d={lineAreaPath} fill="url(#stockLineGradient)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}

            {/* Candlestick bars (when in candle mode) */}
            {chartMode === "candle" &&
              candles.map((c, i) => {
                const x = getX(i);
                const openY = getY(c.open);
                const closeY = getY(c.close);
                const highY = getY(c.high);
                const lowY = getY(c.low);

                const candleIsUp = c.close >= c.open;
                const candleColor = candleIsUp ? "var(--buy, #10b981)" : "var(--sell, #ef4444)";
                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

                return (
                  <g key={`candle-${c.date}`} className="stock-candle">
                    {/* Wick / Sumbu */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={candleColor}
                      strokeWidth="1.2"
                      opacity={activeIndex === i ? 1 : 0.85}
                    />
                    {/* Candle Body */}
                    <rect
                      x={x - barWidth / 2}
                      y={bodyTop}
                      width={barWidth}
                      height={bodyHeight}
                      fill={candleColor}
                      rx="1"
                      opacity={activeIndex === i ? 1 : 0.9}
                    />
                  </g>
                );
              })}

            {/* Moving Average 20 line (Gold) */}
            {showMA20 && ma20Path && (
              <path
                d={ma20Path}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Moving Average 50 line (Cyan/Blue) */}
            {showMA50 && ma50Path && (
              <path
                d={ma50Path}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Interactive Crosshair & Cursor tracking */}
            {hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length && (
              <g className="stock-chart-crosshair-group">
                {/* Vertical hair */}
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={height - padding.bottom}
                  className="stock-chart-crosshair"
                />
                {/* Horizontal hair */}
                <line
                  x1={padding.left}
                  y1={getY(candles[hoverIndex]!.close)}
                  x2={width - padding.right}
                  y2={getY(candles[hoverIndex]!.close)}
                  className="stock-chart-crosshair"
                />
                {/* Active price badge on axis */}
                <rect
                  x={width - padding.right + 2}
                  y={getY(candles[hoverIndex]!.close) - 9}
                  width={58}
                  height={18}
                  rx="3"
                  className="stock-chart-axis-badge"
                />
                <text
                  x={width - padding.right + 6}
                  y={getY(candles[hoverIndex]!.close) + 4}
                  className="stock-chart-axis-badge-text"
                >
                  {fmtNumber(candles[hoverIndex]!.close, 0)}
                </text>
              </g>
            )}

            {/* Date axis ticks at bottom */}
            {dateTicks.map((idx) => {
              const c = candles[idx];
              if (!c) return null;
              const x = getX(idx);
              return (
                <text
                  key={`date-${c.date}`}
                  x={x}
                  y={height - padding.bottom + 18}
                  className="stock-chart-date-tick"
                  textAnchor="middle"
                >
                  {formatAxisDate(c.date)}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* Chart Footer Indicator Legend */}
      <div className="stock-chart-footer">
        <div className="stock-chart-legend">
          <span className="legend-item">
            <span className="legend-dot legend-buy" /> Candlestick Hijau (Naik)
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-sell" /> Candlestick Merah (Turun)
          </span>
          {showMA20 && (
            <span className="legend-item">
              <span className="legend-line legend-ma20" /> MA 20 (Rata-rata 20 Hari)
            </span>
          )}
          {showMA50 && (
            <span className="legend-item">
              <span className="legend-line legend-ma50" /> MA 50 (Rata-rata 50 Hari)
            </span>
          )}
        </div>
        <div className="stock-chart-meta">
          <span>Data historis Yahoo Finance · Interval Harian (1D)</span>
        </div>
      </div>
    </Card>
  );
}
