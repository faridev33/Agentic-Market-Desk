import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "agentic-market-theme";
const MODE_KEY = "agentic-market-theme-mode"; // "auto" | "manual"

/** Jam mulai siang (06:00) dan malam (18:00). */
const DAY_START_HOUR = 6;
const NIGHT_START_HOUR = 18;

/** Tentukan tema berdasarkan jam saat ini: siang → light, malam → dark. */
function timeBasedTheme(): Theme {
  const hour = new Date().getHours();
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? "light" : "dark";
}

function storedTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function storedMode(): "auto" | "manual" {
  try {
    const mode = window.localStorage.getItem(MODE_KEY);
    return mode === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

function initialTheme(): Theme {
  // Kalau user sudah pernah toggle manual, pakai pilihan mereka.
  if (storedMode() === "manual") {
    const manual = storedTheme();
    if (manual) return manual;
  }
  // Default: otomatis berdasarkan waktu (siang = light, malam = dark).
  return timeBasedTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setMode] = useState<"auto" | "manual">(storedMode);

  // Terapkan theme ke DOM dan simpan ke localStorage.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Penyimpanan lokal bisa diblokir; tema tetap berlaku selama sesi ini.
    }
  }, [theme, mode]);

  // Auto-sync: cek setiap menit apakah sudah ganti siang/malam.
  useEffect(() => {
    if (mode !== "auto") return;

    const sync = () => {
      const target = timeBasedTheme();
      setTheme((current) => (current !== target ? target : current));
    };

    // Cek setiap 60 detik.
    const interval = window.setInterval(sync, 60_000);
    return () => window.clearInterval(interval);
  }, [mode]);

  // Toggle manual: kalau user klik toggle, matikan auto dan switch theme.
  const toggleTheme = useCallback(() => {
    setMode("manual");
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  // Kembalikan ke mode auto (opsional, bisa dipanggil dari UI).
  const resetToAuto = useCallback(() => {
    setMode("auto");
    setTheme(timeBasedTheme());
  }, []);

  return { theme, toggleTheme, resetToAuto, isAutoMode: mode === "auto" };
}
