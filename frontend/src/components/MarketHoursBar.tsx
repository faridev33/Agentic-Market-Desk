import { useEffect, useState } from "react";

type PhaseKind = "trading" | "auction" | "break" | "closed";

type Phase = {
  label: string;
  /** Menit sejak 00.00 WIB. */
  start: number;
  end: number;
  kind: PhaseKind;
};

const DAY_MINUTES = 1440;
const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;
const WEEKDAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function hm(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

// Pasar Reguler BEI — SK Direksi BEI No. II-A Kep-00158/BEI/10-2026, seluruhnya WIB.
const MON_THU: Phase[] = [
  { label: "Bursa tutup", start: hm(0), end: hm(8, 45), kind: "closed" },
  { label: "Prapembukaan", start: hm(8, 45), end: hm(9), kind: "auction" },
  { label: "Sesi I", start: hm(9), end: hm(12), kind: "trading" },
  { label: "Istirahat", start: hm(12), end: hm(13, 30), kind: "break" },
  { label: "Sesi II", start: hm(13, 30), end: hm(15, 50), kind: "trading" },
  { label: "Prapenutupan", start: hm(15, 50), end: hm(16, 2), kind: "auction" },
  { label: "Pascapenutupan", start: hm(16, 2), end: hm(16, 15), kind: "auction" },
  { label: "Bursa tutup", start: hm(16, 15), end: DAY_MINUTES, kind: "closed" },
];

const FRI: Phase[] = [
  { label: "Bursa tutup", start: hm(0), end: hm(8, 45), kind: "closed" },
  { label: "Prapembukaan", start: hm(8, 45), end: hm(9), kind: "auction" },
  { label: "Sesi I", start: hm(9), end: hm(11, 30), kind: "trading" },
  { label: "Istirahat", start: hm(11, 30), end: hm(14), kind: "break" },
  { label: "Sesi II", start: hm(14), end: hm(15, 50), kind: "trading" },
  { label: "Prapenutupan", start: hm(15, 50), end: hm(16, 2), kind: "auction" },
  { label: "Pascapenutupan", start: hm(16, 2), end: hm(16, 15), kind: "auction" },
  { label: "Bursa tutup", start: hm(16, 15), end: DAY_MINUTES, kind: "closed" },
];

const WEEKEND: Phase[] = [
  { label: "Akhir pekan", start: hm(0), end: DAY_MINUTES, kind: "closed" },
];

function phasesFor(dayOfWeek: number): Phase[] {
  if (dayOfWeek === 0 || dayOfWeek === 6) return WEEKEND;
  if (dayOfWeek === 5) return FRI;
  return MON_THU;
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function two(value: number): string {
  return String(value).padStart(2, "0");
}

function clockLabel(minutes: number): string {
  const safe = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${two(Math.floor(safe / 60))}.${two(safe % 60)}`;
}

function countdownLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  if (minutes > 0) return `${minutes} menit`;
  return `${seconds} detik`;
}

type MarketView = {
  kind: PhaseKind;
  status: string;
  clock: string;
  dayName: string;
  activeRow: string;
  nextLabel: string;
  nextClock: string;
  nextDay: string;
  remaining: string;
};

function buildView(instant: Date): MarketView {
  const parts = CLOCK.formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  // WIB memakai offset tetap GMT+7, jadi konversi ini eksak.
  const midnight = Date.UTC(year, month - 1, day) - WIB_OFFSET_MS;
  const dayOfWeek = new Date(midnight + WIB_OFFSET_MS).getUTCDay();
  const secondOfDay = pick("hour") % 24 * 3600 + pick("minute") * 60 + pick("second");

  const phases = phasesFor(dayOfWeek);
  let position = phases.length - 1;
  for (let i = 0; i < phases.length; i += 1) {
    if (secondOfDay >= phases[i].start * 60 && secondOfDay < phases[i].end * 60) {
      position = i;
      break;
    }
  }

  const current = phases[position];
  let nextLabel = "";
  let nextClock = "";
  let nextDay = "";
  let nextAtMs = 0;

  if (position + 1 < phases.length) {
    const next = phases[position + 1];
    nextLabel = next.label;
    nextClock = clockLabel(next.start);
    nextAtMs = midnight + next.start * 60_000;
  } else {
    for (let offset = 1; offset <= 7; offset += 1) {
      const dayStart = midnight + offset * DAY_MS;
      const candidate = new Date(dayStart + WIB_OFFSET_MS).getUTCDay();
      if (candidate === 0 || candidate === 6) continue;
      const list = phasesFor(candidate);
      const next = list[1] ?? list[0];
      nextLabel = next.label;
      nextClock = clockLabel(next.start);
      nextDay = WEEKDAY_NAMES[candidate];
      nextAtMs = dayStart + next.start * 60_000;
      break;
    }
  }

  let status = current.label;
  if (current.kind === "trading") status = `Buka · ${current.label}`;
  if (current.kind === "closed") status = current.label === "Akhir pekan" ? "Tutup · akhir pekan" : "Tutup";

  return {
    kind: current.kind,
    status,
    clock: `${two(pick("hour") % 24)}.${two(pick("minute"))}.${two(pick("second"))}`,
    dayName: WEEKDAY_NAMES[dayOfWeek],
    activeRow: current.kind === "trading" || current.kind === "break" ? current.label : "",
    nextLabel,
    nextClock,
    nextDay,
    remaining: countdownLabel(nextAtMs - instant.getTime()),
  };
}

const SCHEDULE: { phase: string; monThu: string; fri: string }[] = [
  { phase: "Prapembukaan", monThu: "08.45 – 09.00", fri: "08.45 – 09.00" },
  { phase: "Sesi I", monThu: "09.00 – 12.00", fri: "09.00 – 11.30" },
  { phase: "Istirahat", monThu: "12.00 – 13.30", fri: "11.30 – 14.00" },
  { phase: "Sesi II", monThu: "13.30 – 15.50", fri: "14.00 – 15.50" },
  { phase: "Prapenutupan", monThu: "15.50 – 16.00", fri: "15.50 – 16.00" },
  { phase: "Pascapenutupan", monThu: "16.02 – 16.15", fri: "16.02 – 16.15" },
];

export function MarketHoursBar() {
  const [view, setView] = useState(() => buildView(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setView(buildView(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={`market-hours market-hours--${view.kind}`} aria-label="Jam buka bursa saham">
      <div className="market-hours-top">
        <span className="market-hours-pill">
          <i aria-hidden="true" />
          {view.status}
        </span>
        <span className="market-hours-clock" title="Waktu Indonesia Barat (GMT+7)">
          <b>{view.clock}</b>
          <small>WIB · {view.dayName}</small>
        </span>
        <span className="market-hours-next">
          Menuju <b>{view.nextLabel}</b>
          {view.nextDay ? <b> {view.nextDay}</b> : null} <b>{view.nextClock}</b> WIB · sisa{" "}
          <b>{view.remaining}</b>
        </span>
      </div>

      <details className="market-hours-schedule">
        <summary>Jadwal Perdagangan Pasar Reguler BEI</summary>
        <table className="market-hours-table">
          <thead>
            <tr>
              <th scope="col">Fase</th>
              <th scope="col">Senin – Kamis</th>
              <th scope="col">Jumat</th>
            </tr>
          </thead>
          <tbody>
            {SCHEDULE.map((row) => (
              <tr key={row.phase} className={row.phase === view.activeRow ? "is-current" : undefined}>
                <th scope="row">{row.phase}</th>
                <td>{row.monThu}</td>
                <td>{row.fri}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Sabtu – Minggu</th>
              <td colSpan={2}>Bursa libur</td>
            </tr>
          </tbody>
        </table>
        <p className="market-hours-note">
          Bursa buka pukul 09.00 WIB dan tutup pukul 16.00 WIB. Libur bursa nasional tidak
          diperhitungkan — cek kalender BEI untuk tanggal merah.
        </p>
      </details>
    </section>
  );
}
