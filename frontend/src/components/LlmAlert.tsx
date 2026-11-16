import { useEffect, useState } from "react";
import type { LlmHealth } from "../api";
import { fmtDateTime } from "../format";
import { Spinner } from "./ui";

interface Problem {
  /** Kunci pembeda: kalau masalah berubah, popup muncul lagi walau sempat ditutup. */
  key: string;
  tone: "error" | "warn";
  title: string;
  message: string;
  hint: string;
  detail: string | null;
}

function problemOf(health: LlmHealth | null, requestError: string | null): Problem | null {
  if (requestError) {
    return {
      key: `request:${requestError}`,
      tone: "error",
      title: "Status AI tidak bisa diperiksa",
      message: "Halaman tidak mendapat jawaban dari endpoint status AI di backend.",
      hint: "Pastikan backend berjalan di port 3000, lalu tekan “Cek ulang”.",
      detail: requestError,
    };
  }
  if (!health) return null;

  if (health.state === "error") {
    return {
      key: `error:${health.error ?? health.checkedAt ?? ""}`,
      tone: "error",
      title: "AI sedang bermasalah",
      message:
        "Model LLM tidak merespons. Selama ini berlangsung, agen analisa, skor sentimen, dan panel rekomendasi tidak bisa memberi hasil AI.",
      hint:
        "Periksa LLM_BASE_URL, LLM_MODEL, dan LLM_API_KEY di backend/.env, pastikan server LLM menyala, lalu tekan “Cek ulang”.",
      detail: health.error,
    };
  }

  if (health.state === "disabled") {
    return {
      key: "disabled",
      tone: "warn",
      title: "AI belum diaktifkan",
      message:
        "LLM_API_KEY kosong, jadi aplikasi hanya memakai analisis heuristik deterministik (tanpa agen AI).",
      hint: "Isi LLM_API_KEY (beserta LLM_BASE_URL dan LLM_MODEL) di backend/.env, lalu restart backend.",
      detail: null,
    };
  }

  return null;
}

/**
 * Popup peringatan status AI untuk halaman utama.
 * Muncul otomatis saat model LLM mati, bisa ditutup (berubah jadi tombol kecil di kanan bawah).
 */
export function LlmAlert({
  health,
  requestError,
  checking,
  manualOpen = false,
  onManualClose,
  onRetry,
}: {
  health: LlmHealth | null;
  requestError: string | null;
  checking: boolean;
  manualOpen?: boolean;
  onManualClose?: () => void;
  onRetry: () => void;
}) {
  const problem = problemOf(health, requestError);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // Terbuka otomatis saat ada problem (kecuali pengguna menutupnya untuk problem spesifik ini)
  // ATAU terbuka manual saat pengguna mengklik status LLM di header
  const isAutoOpen = problem !== null && dismissedKey !== problem.key;
  const isVisible = manualOpen || isAutoOpen;

  const handleClose = () => {
    if (problem) {
      setDismissedKey(problem.key);
    }
    if (onManualClose) {
      onManualClose();
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!isVisible && problem !== null) {
    return (
      <button
        type="button"
        className={`llm-pill llm-pill--${problem.tone}`}
        onClick={() => setDismissedKey(null)}
        aria-label={`${problem.title} — klik untuk membuka rincian`}
      >
        <span className="llm-pill-mark" aria-hidden="true">
          !
        </span>
        <span>{problem.tone === "error" ? "Model AI Eror" : "AI Nonaktif"}</span>
      </button>
    );
  }

  if (!isVisible) return null;

  if (problem) {
    return (
      <div className="llm-alert-overlay" role="presentation" onClick={handleClose}>
        <div
          className={`llm-alert llm-alert--${problem.tone}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="llm-alert-title"
          aria-describedby="llm-alert-message"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="llm-alert-head">
            <span className="llm-alert-mark" aria-hidden="true">
              !
            </span>
            <div className="llm-alert-title-wrap">
              <p className="eyebrow">Diagnostik Sistem AI</p>
              <h2 id="llm-alert-title">{problem.title}</h2>
            </div>
            <button
              type="button"
              className="llm-alert-close"
              onClick={handleClose}
              aria-label="Tutup peringatan"
            >
              ×
            </button>
          </header>

          <p id="llm-alert-message" className="llm-alert-message">
            {problem.message}
          </p>

          {problem.detail ? (
            <div className="llm-alert-detail-wrap">
              <span className="llm-alert-detail-label">Laporan Galat Gateway / Probe:</span>
              <pre className="llm-alert-detail">{problem.detail}</pre>
            </div>
          ) : null}

          <dl className="llm-alert-meta">
            <div>
              <dt>Model Dikonfigurasi</dt>
              <dd>{health?.model ?? "—"}</dd>
            </div>
            <div>
              <dt>Waktu Pengecekan</dt>
              <dd>{health?.checkedAt ? fmtDateTime(health.checkedAt) : "Belum pernah"}</dd>
            </div>
            <div>
              <dt>Kegagalan Beruntun</dt>
              <dd>{health ? `${health.consecutiveFailures}×` : "—"}</dd>
            </div>
            <div>
              <dt>Batas Waktu Probe</dt>
              <dd>{health ? `${Math.round(health.probeTimeoutMs / 1000)} detik` : "—"}</dd>
            </div>
          </dl>

          <p className="llm-alert-hint">{problem.hint}</p>

          <footer className="llm-alert-actions">
            <button type="button" className="btn btn-ghost" onClick={handleClose}>
              Tutup
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRetry}
              disabled={checking}
            >
              {checking ? <Spinner label="Sedang menguji..." /> : "Cek Ulang (Test Model)"}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="llm-alert-overlay" role="presentation" onClick={handleClose}>
      <div
        className="llm-alert llm-alert--ok"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-alert-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="llm-alert-head">
          <span className="llm-alert-mark llm-alert-mark--ok" aria-hidden="true">
            ✓
          </span>
          <div className="llm-alert-title-wrap">
            <p className="eyebrow">Diagnostik Sistem AI</p>
            <h2 id="llm-alert-title">Model AI Berjalan Normal & Terverifikasi</h2>
          </div>
          <button
            type="button"
            className="llm-alert-close"
            onClick={handleClose}
            aria-label="Tutup jendela"
          >
            ×
          </button>
        </header>

        <p className="llm-alert-message">
          Uji konektivitas dan inferensi real-time berhasil. Gateway LLM merespons cepat dan menghasilkan keluaran yang valid.
        </p>

        <dl className="llm-alert-meta">
          <div>
            <dt>Model Terpasang</dt>
            <dd>{health?.model ?? "—"}</dd>
          </div>
          <div>
            <dt>Model yang Menjawab</dt>
            <dd>{health?.modelReplied ?? health?.model ?? "—"}</dd>
          </div>
          <div>
            <dt>Waktu Respons (Latensi)</dt>
            <dd>{health?.latencyMs !== null && health !== undefined ? `${health?.latencyMs} ms` : "—"}</dd>
          </div>
          <div>
            <dt>Terakhir Terverifikasi</dt>
            <dd>{health?.checkedAt ? fmtDateTime(health.checkedAt) : "—"}</dd>
          </div>
          {health?.replyPreview ? (
            <div className="llm-alert-meta--full">
              <dt>Cuplikan Respons Uji Coba</dt>
              <dd><code>{health.replyPreview}</code></dd>
            </div>
          ) : null}
        </dl>

        <p className="llm-alert-hint">
          Pemeriksaan berkala berjalan otomatis di latar belakang untuk memastikan semua agen siap menganalisis saham.
        </p>

        <footer className="llm-alert-actions">
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            Tutup
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRetry}
            disabled={checking}
          >
            {checking ? <Spinner label="Sedang menguji..." /> : "Uji Ulang (Test Lagi)"}
          </button>
        </footer>
      </div>
    </div>
  );
}
