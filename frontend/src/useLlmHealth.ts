import { useCallback, useEffect, useRef, useState } from "react";
import { api, toApiError } from "./api";
import type { LlmHealth } from "./api";

/** Jarak antar pemeriksaan otomatis. Backend sendiri meng-cache hasil probe ~60 detik. */
const POLL_MS = 60_000;

export interface LlmHealthState {
  health: LlmHealth | null;
  /** Pesan bila endpoint status tidak bisa dihubungi (backend mati/timeout). */
  requestError: string | null;
  checking: boolean;
  refresh: () => void;
}

/**
 * Memantau kesehatan model LLM untuk peringatan di halaman utama.
 * Pemeriksaan pertama langsung (probe), selanjutnya tiap 60 detik dan tiap tab kembali aktif.
 */
export function useLlmHealth(): LlmHealthState {
  const [health, setHealth] = useState<LlmHealth | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const check = useCallback((force: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    void api
      .llmHealth(force)
      .then((value) => {
        setHealth(value);
        setRequestError(null);
      })
      .catch((error: unknown) => {
        setRequestError(toApiError(error).message);
      })
      .finally(() => {
        busy.current = false;
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    check(true);
    const interval = window.setInterval(() => check(false), POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") check(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check]);

  const refresh = useCallback(() => check(true), [check]);

  return { health, requestError, checking, refresh };
}
