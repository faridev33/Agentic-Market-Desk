import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  toApiError,
  type ApiError,
  type TopPicksProgress,
  type TopPicksResult,
} from "./api";

export interface TopPicksState {
  result: TopPicksResult | null;
  progress: TopPicksProgress | null;
  error: ApiError | null;
  busy: boolean;
  refreshing: boolean;
  run: () => void;
  refresh: () => void;
}

const POLL_MS = 2500;

/** Memuat snapshot terakhir, memantau job latar belakang, dan memicu pemindaian baru. */
export function useTopPicks(): TopPicksState {
  const [result, setResult] = useState<TopPicksResult | null>(null);
  const [progress, setProgress] = useState<TopPicksProgress | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    try {
      const payload = await api.topPicks();
      if (!mounted.current) return;
      setResult(payload.result);
      setProgress(payload.progress);
      setError(null);
    } catch (caught) {
      if (mounted.current) setError(toApiError(caught));
    } finally {
      if (mounted.current && showSpinner) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const running = progress?.status === "running";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await api.topPicksStatus();
        if (!mounted.current) return;
        setProgress(status);
        if (status.status !== "running") {
          const payload = await api.topPicks();
          if (!mounted.current) return;
          setResult(payload.result);
          setProgress(payload.progress);
        }
      } catch (caught) {
        if (mounted.current) setError(toApiError(caught));
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await api.runTopPicks();
      if (!mounted.current) return;
      setProgress(started);
    } catch (caught) {
      if (mounted.current) setError(toApiError(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return {
    result,
    progress,
    error,
    busy,
    refreshing,
    run: () => {
      void run();
    },
    refresh,
  };
}
