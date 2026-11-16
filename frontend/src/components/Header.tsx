import type { Health, LlmHealth, Quote } from "../api";
import { fmtMoney, fmtPct } from "../format";
import type { Theme } from "../theme";
import { StatusDot } from "./ui";

export type Tab = "office" | "screener" | "berita" | "cek" | "analisa" | "jalankan";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "office", label: "Kantor", hint: "Ruang kerja agen" },
  { id: "screener", label: "Screener", hint: "Pindai saham IDX" },
  { id: "berita", label: "Berita", hint: "Kabar pasar terbaru" },
  { id: "cek", label: "Cek Saham", hint: "Harga, grafik & rasio" },
  { id: "analisa", label: "Analisa", hint: "5 emiten rekomendasi beli" },
  { id: "jalankan", label: "Jalankan", hint: "Pipeline 8 agen" },
];

function QuoteChip({ quote }: { quote: Quote | null }) {
  if (!quote) {
    return (
      <div className="quote-chip quote-chip--empty">
        <span className="quote-symbol">—</span>
        <span className="quote-price">Menunggu data</span>
      </div>
    );
  }
  const change = quote.changePct;
  const tone = change === null ? "flat" : change >= 0 ? "up" : "down";
  const label = quote.symbol === "^JKSE" || quote.symbol === "JKSE" ? "IHSG" : quote.symbol;
  return (
    <div className="quote-chip">
      <div className="quote-main">
        <span className="quote-symbol">{label}</span>
        <span className="quote-price">{fmtMoney(quote.price, "IDR", 0)}</span>
      </div>
      <div className="quote-meta">
        <span className={`quote-change quote-change--${tone}`}>{fmtPct(change, 2, true)}</span>
        <span className="quote-state">{quote.marketState ?? quote.exchange ?? "—"}</span>
      </div>
    </div>
  );
}

export function Header({
  tab,
  onTab,
  health,
  quote,
  theme,
  onToggleTheme,
  isAutoMode,
  onResetAuto,
  llmHealth,
  onOpenLlmStatus,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  health: Health | null;
  quote: Quote | null;
  theme: Theme;
  onToggleTheme: () => void;
  isAutoMode?: boolean;
  onResetAuto?: () => void;
  llmHealth?: LlmHealth | null;
  onOpenLlmStatus?: () => void;
}) {
  const targetTheme = theme === "dark" ? "terang" : "gelap";
  const llmStatusText = !health
    ? "port 3000"
    : !llmHealth
      ? `LLM ${health.llmEnabled ? "aktif" : "deterministik"}`
      : llmHealth.state === "healthy"
        ? `LLM siap (${llmHealth.latencyMs ?? 0}ms)`
        : llmHealth.state === "error"
          ? "LLM bermasalah"
          : llmHealth.state === "disabled"
            ? "LLM nonaktif"
            : "LLM memeriksa...";
  const llmStatusTone = !llmHealth
    ? health?.llmEnabled ? "ok" : "muted"
    : llmHealth.state === "healthy"
      ? "ok"
      : llmHealth.state === "error"
        ? "error"
        : "muted";
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
              <path
                d="M4 23.5 10.5 16l4.6 3.9L21.5 11l6.5 4.2"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="27.5" cy="15" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">Agentic Market Desk</span>
            <span className="brand-sub">Screener, berita, dan analisa saham IDX · Rupiah</span>
          </div>
        </div>

        <div className="topbar-side">
          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Gunakan mode ${targetTheme}`}
            title={`Gunakan mode ${targetTheme}${isAutoMode ? " (otomatis berdasarkan waktu)" : ""}`}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === "dark" ? "☀" : "☾"}
            </span>
            <span className="theme-toggle-label">{theme === "dark" ? "Terang" : "Gelap"}</span>
          </button>
          {!isAutoMode && onResetAuto && (
            <button
              type="button"
              className="theme-auto-btn"
              onClick={onResetAuto}
              title="Kembali ke mode otomatis (siang=terang, malam=gelap)"
            >
              Auto
            </button>
          )}

          <button
            type="button"
            className={`conn conn--button ${health ? "is-online" : "is-offline"}`}
            onClick={onOpenLlmStatus}
            title="Klik untuk melihat status diagnostik & uji coba model AI"
          >
            <StatusDot ok={Boolean(health && (!llmHealth || llmHealth.state === "healthy"))} />
            <span>{health ? "API terhubung" : "API offline"}</span>
            <span className={`conn-sub conn-sub--${llmStatusTone}`}>
              {llmStatusText}
            </span>
          </button>
          <QuoteChip quote={quote} />
        </div>
      </header>

      <nav className="tabbar" role="tablist" aria-label="Navigasi utama">
        <div className="tabbar-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`panel-${entry.id}`}
              className={`tab ${tab === entry.id ? "is-active" : ""}`}
              onClick={() => onTab(entry.id)}
            >
              <span className="tab-label">{entry.label}</span>
              <span className="tab-hint">{entry.hint}</span>
            </button>
          ))}
        </div>
        <span className="tabbar-note">Bukan nasihat keuangan · semua nilai dalam Rupiah</span>
      </nav>
    </>
  );
}
