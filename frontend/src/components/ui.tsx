import type { ReactNode } from "react";
import { clamp01, type Tone } from "../format";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function Section({
  eyebrow,
  title,
  aside,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`.trim()}>
      <header className="section-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {aside ? <div className="section-aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Badge({
  tone = "muted",
  children,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(-1, Math.min(1, score));
  const width = Math.abs(clamped) * 50;
  const positive = clamped >= 0;
  const tone = clamped > 0.15 ? "buy" : clamped < -0.15 ? "sell" : "muted";
  return (
    <div
      className={`score-bar score-bar--${tone}`}
      role="img"
      aria-label={`Skor ${clamped.toFixed(2)} dari -1 sampai 1`}
    >
      <span className="score-bar-axis" aria-hidden="true" />
      <span
        className={`score-bar-fill ${positive ? "is-positive" : "is-negative"}`}
        style={positive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

export function Meter({
  value,
  tone = "info",
  label,
}: {
  value: number;
  tone?: Tone;
  label?: string;
}) {
  const pct = clamp01(value) * 100;
  return (
    <div className="meter-wrap">
      <div
        className={`meter meter--${tone}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={label ?? "Nilai"}
      >
        <span className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      {label ? <span className="meter-label">{label}</span> : null}
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Spinner({ label = "Memuat" }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner-ring" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </span>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-line" style={{ width: `${92 - index * 14}%` }} />
      ))}
    </div>
  );
}

export function ErrorBanner({
  title = "Terjadi kesalahan",
  message,
  code,
  issues,
  onRetry,
}: {
  title?: string;
  message: string;
  code?: string;
  issues?: string[];
  onRetry?: () => void;
}) {
  return (
    <div className="error-banner" role="alert">
      <div className="error-body">
        <div className="error-title">
          <span className="error-mark" aria-hidden="true">
            !
          </span>
          {title}
          {code ? <code className="error-code">{code}</code> : null}
        </div>
        <p>{message}</p>
        {issues && issues.length > 0 ? (
          <ul className="error-list">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  kicker,
  title,
  children,
  action,
}: {
  kicker?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {kicker ? <p className="eyebrow">{kicker}</p> : null}
      <h3>{title}</h3>
      <div className="empty-body">{children}</div>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`status-dot ${ok ? "is-online" : "is-offline"}`} aria-hidden="true" />;
}
