import { relativeTime, fmtDateTime } from "../format";

export interface DataTimestamp {
  /** ISO date string of when data was last updated/fetched */
  iso: string | null | undefined;
  /** Short label describing the data source */
  label?: string;
}

/**
 * Reusable banner showing when data was last updated.
 * Accepts one or more timestamps to display.
 *
 * Usage:
 *   <DataUpdatedAt timestamps={[{ iso: "2026-...", label: "Snapshot" }]} />
 */
export function DataUpdatedAt({
  timestamps,
  className = "",
}: {
  timestamps: DataTimestamp[];
  className?: string;
}) {
  const valid = timestamps.filter((t) => t.iso);

  if (valid.length === 0) {
    return (
      <div className={`data-updated-bar data-updated-bar--empty ${className}`.trim()}>
        <span className="data-updated-icon" aria-hidden="true">⏳</span>
        <span className="data-updated-text">Belum ada data · jalankan pengambilan data untuk memulai</span>
      </div>
    );
  }

  return (
    <div className={`data-updated-bar ${className}`.trim()}>
      <span className="data-updated-icon" aria-hidden="true">🕐</span>
      <div className="data-updated-entries">
        {valid.map((t, i) => (
          <span key={i} className="data-updated-entry">
            {t.label ? <em className="data-updated-label">{t.label}:</em> : null}
            <strong className="data-updated-relative">{relativeTime(t.iso!)}</strong>
            <span className="data-updated-abs" title={t.iso!}>({fmtDateTime(t.iso)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
