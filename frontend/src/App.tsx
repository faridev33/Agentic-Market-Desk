import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, toApiError } from "./api";
import type {
  AnalyzeInput,
  OfficeSnapshot,
  AnalysisResult,
  ApiError,
  Health,
  MacroSnapshot,
  Quote,
} from "./api";
import { AnalisaPage } from "./components/AnalisaPage";
import { CekSahamPage } from "./components/CekSahamPage";
import { Header, type Tab } from "./components/Header";
import { LlmAlert } from "./components/LlmAlert";
import { NewsPage } from "./components/NewsPage";
import { RunAnalysisPage } from "./components/RunAnalysisPage";
import { ScreenerPage } from "./components/ScreenerPage";
import { DEFAULT_CHECK_SYMBOL } from "./market";
import { useTheme } from "./theme";
import { useLlmHealth } from "./useLlmHealth";

const OfficePage = lazy(() => import("./components/OfficePage").then((module) => ({ default: module.OfficePage })));

const SYMBOL_PATTERN = /^[A-Za-z0-9.^=_-]{1,24}$/;
const DEFAULT_SYMBOL = "BBCA.JK";
const DEFAULT_EQUITY = 100_000_000;

export function App() {
  const { theme, toggleTheme, resetToAuto, isAutoMode } = useTheme();
  const llm = useLlmHealth();
  const [showLlmModal, setShowLlmModal] = useState(false);
  const [tab, setTab] = useState<Tab>("office");
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [checkSymbol, setCheckSymbol] = useState(DEFAULT_CHECK_SYMBOL);
  const [health, setHealth] = useState<Health | null>(null);
  const [office, setOffice] = useState<OfficeSnapshot | null>(null);
  const [officeLoading, setOfficeLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [checkQuote, setCheckQuote] = useState<Quote | null>(null);
  const [macro, setMacro] = useState<MacroSnapshot | null>(null);
  const [macroError, setMacroError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<ApiError | null>(null);

  const loadHealth = useCallback(() => {
    void api
      .health()
      .then((value) => setHealth(value))
      .catch(() => setHealth(null));
  }, []);

  const loadOffice = useCallback(() => {
    setOfficeLoading(true);
    void api
      .office()
      .then((value) => setOffice(value))
      .catch(() => setOffice(null))
      .finally(() => setOfficeLoading(false));
  }, []);

  const loadMacro = useCallback(() => {
    setMacroError(null);
    void api
      .macro()
      .then((value) => setMacro(value))
      .catch((error: unknown) => setMacroError(toApiError(error).message));
  }, []);

  useEffect(() => {
    loadHealth();
    loadOffice();
    loadMacro();
    const interval = window.setInterval(() => {
      loadHealth();
      loadOffice();
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [loadHealth, loadOffice, loadMacro]);

  // Ticker header selalu menampilkan IHSG, bukan emiten yang sedang dibuka.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api
        .quote(DEFAULT_CHECK_SYMBOL)
        .then((value) => {
          if (!cancelled) setQuote(value);
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        });
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Quote untuk emiten/indeks yang sedang dicek di halaman Cek Saham.
  useEffect(() => {
    if (!SYMBOL_PATTERN.test(checkSymbol)) {
      setCheckQuote(null);
      return;
    }
    let cancelled = false;
    void api
      .quote(checkSymbol)
      .then((value) => {
        if (!cancelled) setCheckQuote(value);
      })
      .catch(() => {
        if (!cancelled) setCheckQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [checkSymbol]);

  const analyze = useCallback((input: AnalyzeInput) => {
    setAnalysisBusy(true);
    setAnalysisError(null);
    setTab("jalankan");
    void api
      .analyze(input)
      .then((result) => {
        setAnalysis(result);
        setSymbol(result.symbol);
      })
      .catch((error: unknown) => setAnalysisError(toApiError(error)))
      .finally(() => setAnalysisBusy(false));
  }, []);

  const analyzeSymbol = useCallback(
    (nextSymbol: string) => {
      setSymbol(nextSymbol);
      analyze({
        symbol: nextSymbol,
        focus: "both",
        equity: DEFAULT_EQUITY,
        currentDrawdownPct: 0,
        sectorExposurePct: 0,
      });
    },
    [analyze],
  );

  // Dari kartu 5 emiten / daftar mana pun → buka halaman Cek Saham untuk simbol itu.
  const openCheck = useCallback((nextSymbol: string) => {
    setCheckSymbol(nextSymbol);
    setTab("cek");
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Lewati ke konten
      </a>

      <Header
        tab={tab}
        onTab={setTab}
        health={health}
        quote={quote}
        theme={theme}
        onToggleTheme={toggleTheme}
        isAutoMode={isAutoMode}
        onResetAuto={resetToAuto}
        llmHealth={llm.health}
        onOpenLlmStatus={() => setShowLlmModal(true)}
      />

      <LlmAlert
        health={llm.health}
        requestError={llm.requestError}
        checking={llm.checking}
        manualOpen={showLlmModal}
        onManualClose={() => setShowLlmModal(false)}
        onRetry={llm.refresh}
      />

      <main id="main" className="app-main">
        <div
          role="tabpanel"
          id="panel-office"
          aria-labelledby="tab-office"
          className="tab-panel"
          hidden={tab !== "office"}
        >
          <Suspense fallback={<div className="office-scene-placeholder"><strong>Membuka kantor virtual…</strong></div>}>
            <OfficePage
              snapshot={office}
              online={Boolean(health)}
              loading={officeLoading}
              onOpenAnalysis={() => setTab("analisa")}
              onOpenCheck={openCheck}
            />
          </Suspense>
        </div>

        <div
          role="tabpanel"
          id="panel-screener"
          aria-labelledby="tab-screener"
          className="tab-panel"
          hidden={tab !== "screener"}
        >
          <ScreenerPage onAnalyze={analyzeSymbol} />
        </div>

        <div
          role="tabpanel"
          id="panel-berita"
          aria-labelledby="tab-berita"
          className="tab-panel"
          hidden={tab !== "berita"}
        >
          <NewsPage onAnalyze={analyzeSymbol} />
        </div>

        <div
          role="tabpanel"
          id="panel-cek"
          aria-labelledby="tab-cek"
          className="tab-panel"
          hidden={tab !== "cek"}
        >
          <CekSahamPage
            symbol={checkSymbol}
            quote={checkQuote}
            onSymbolChange={setCheckSymbol}
            onRunAnalysis={analyzeSymbol}
          />
        </div>

        <div
          role="tabpanel"
          id="panel-analisa"
          aria-labelledby="tab-analisa"
          className="tab-panel"
          hidden={tab !== "analisa"}
        >
          <AnalisaPage onSelectSymbol={openCheck} onAnalyzeSymbol={analyzeSymbol} />
        </div>

        <div
          role="tabpanel"
          id="panel-jalankan"
          aria-labelledby="tab-jalankan"
          className="tab-panel"
          hidden={tab !== "jalankan"}
        >
          <RunAnalysisPage
            symbol={symbol}
            analysis={analysis}
            busy={analysisBusy}
            error={analysisError}
            macro={macro}
            macroError={macroError}
            onSymbolChange={setSymbol}
            onAnalyze={analyze}
            onReloadMacro={loadMacro}
          />
        </div>
      </main>

      <footer className="app-footer">
        <span>Agentic Market Desk · Fastify + Yahoo Finance · semuanya dalam Rupiah</span>
        <span>
          Decision support, bukan nasihat keuangan. Probabilitas belum terkalibrasi; verifikasi
          sebelum bertransaksi.
        </span>
      </footer>
    </div>
  );
}
