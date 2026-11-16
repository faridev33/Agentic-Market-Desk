import { useMemo, useState } from "react";
import type { OfficeAgent, OfficeSnapshot } from "../api";
import { fmtDateTime, fmtPct } from "../format";
import { DataUpdatedAt } from "./DataUpdatedAt";
import { MarketHoursBar } from "./MarketHoursBar";
import { OfficeScene } from "./OfficeScene";
import { PortfolioTracker } from "./PortfolioTracker";

const STATUS_LABEL: Record<OfficeAgent["status"], string> = {
  idle: "Siaga",
  working: "Bekerja",
  ok: "Selesai",
  degraded: "Perlu perhatian",
  failed: "Gagal",
};

const AVATARS: Record<OfficeAgent["id"], string> = {
  data_ingestion: "DI",
  technical: "TA",
  fundamental: "FA",
  macro: "MA",
  sentiment: "SA",
  synthesizer: "SY",
  risk_manager: "RM",
  critic: "CR",
};

function AgentCard({ agent, selected, onSelect }: {
  agent: OfficeAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`office-agent-card office-agent-card--${agent.status}${selected ? " is-selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={`office-agent-avatar avatar--${agent.id}`}>{AVATARS[agent.id]}</span>
      <span className="office-agent-copy">
        <span className="office-agent-title">{agent.name}<span className="office-agent-role">{agent.role}</span></span>
        <span className="office-agent-task">{agent.task}</span>
      </span>
      <span className={`office-status office-status--${agent.status}`}>
        <i />{STATUS_LABEL[agent.status]}
      </span>
    </button>
  );
}

export function OfficePage({
  snapshot,
  online,
  loading,
  onOpenAnalysis,
  onOpenCheck,
}: {
  snapshot: OfficeSnapshot | null;
  online: boolean;
  loading: boolean;
  onOpenAnalysis: () => void;
  onOpenCheck?: (symbol: string) => void;
}) {
  const agents = snapshot?.agents ?? [];
  const [floor, setFloor] = useState<1 | 2>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => agents.find((agent) => agent.id === selectedId) ?? agents.find((agent) => agent.status === "working") ?? agents[0] ?? null,
    [agents, selectedId],
  );
  const working = agents.filter((agent) => agent.status === "working").length;
  const completed = agents.filter((agent) => agent.status === "ok" || agent.status === "degraded").length;

  const selectAgent = (agent: OfficeAgent) => setSelectedId(agent.id);

  return (
    <section className="office-page" aria-labelledby="office-title">
      <div className="office-heading">
        <div>
          <div className="office-kicker"><span>WORKSPACE / 01</span><i /> AGENT FLOOR</div>
          <h1 id="office-title">Kantor virtual</h1>
          <p>Ruang kerja untuk tim analisis saham multi-agen Anda.</p>
        </div>
        <div className="office-heading-actions">
          <span className={`office-live ${online ? "is-online" : "is-offline"}`}><i />{online ? "API TERHUBUNG" : "API OFFLINE"}</span>
          <button className="office-primary-btn" type="button" onClick={onOpenAnalysis}>Buka halaman analisa <span aria-hidden="true">↗</span></button>
        </div>
      </div>

      <div className="office-toolbar">
        <div className="office-floor-nav" role="group" aria-label="Pilih Lantai Kantor">
          <button
            type="button"
            className={`office-floor-tab ${floor === 1 ? "is-active" : ""}`}
            onClick={() => setFloor(1)}
            title="Lantai 1: Kantor, lounge, pantry dan stasiun kerja agen"
            aria-pressed={floor === 1}
          >
            <b className="floor-badge">1</b>
            <span>Kantor</span>
          </button>
          <button
            type="button"
            className={`office-floor-tab ${floor === 2 ? "is-active" : ""}`}
            onClick={() => setFloor(2)}
            title="Lantai 2: Kamar tidur, lesehan dan balkon"
            aria-pressed={floor === 2}
          >
            <b className="floor-badge">2</b>
            <span>Kamar &amp; Balkon</span>
          </button>
        </div>

        <div className="office-toolbar-meta">
          <span><b>{agents.length || 4}</b> agen</span>
          <span className="office-meta-sep" />
          <span><b>{working}</b> bekerja</span>
          <span className="office-meta-sep" />
          <span>{loading ? "Memuat status…" : "Pembaruan otomatis"}</span>
        </div>
        <span className="office-privacy">PANTAUAN LOKAL · READ ONLY</span>
      </div>

      <DataUpdatedAt
        timestamps={[
          { iso: snapshot?.generatedAt, label: "Status agen" },
          { iso: snapshot?.latestAnalysis?.createdAt, label: "Analisis terakhir" },
        ]}
      />

      <MarketHoursBar />

      <div className="office-layout">
        <div className="office-main-column">
          <div className="office-scene-frame">
            {agents.length > 0 ? (
              <OfficeScene
                agents={agents}
                onSelect={selectAgent}
                floor={floor}
                onFloorChange={setFloor}
              />
            ) : (
              <div className="office-scene-placeholder">
                <div className="placeholder-room">◇</div>
                <strong>{online ? "Menyiapkan kantor…" : "Backend belum terhubung"}</strong>
                <span>
                  {online
                    ? "Status agen akan muncul di sini."
                    : "Jalankan backend Fastify untuk membaca status agen."}
                </span>
              </div>
            )}
          </div>
          <div className="office-bottom-strip">
            <div className="office-latest"><span className="latest-symbol">{snapshot?.latestAnalysis?.symbol ?? "—"}</span><span><b>{snapshot?.latestAnalysis ? "Analisis terakhir" : "Belum ada analisis"}</b><small>{snapshot?.latestAnalysis ? fmtDateTime(snapshot.latestAnalysis.createdAt) : "Jalankan analisa untuk melihat status agen di sini."}</small></span></div>
            <div className="office-bottom-stats"><span><b>{completed}</b><small>AGEN SELESAI</small></span><span><b>{working}</b><small>SEDANG BEKERJA</small></span></div>
          </div>
        </div>

        <aside className="office-side-panel" aria-label="Tim agen">
          <div className="office-panel-heading"><div><span className="office-panel-overline">YOUR CREW</span><h2>Tim analis</h2></div><span className="crew-count">{agents.length.toString().padStart(2, "0")}</span></div>
          <div className="office-team-list">
            {agents.map((agent) => <AgentCard key={agent.id} agent={agent} selected={selected?.id === agent.id} onSelect={() => selectAgent(agent)} />)}
            {agents.length === 0 && <div className="office-team-empty">Menunggu koneksi ke API.</div>}
          </div>

          <div className="office-detail-card">
            <div className="office-detail-heading"><span>STATION STATUS</span><span className={`office-status-tag office-status-tag--${selected?.status ?? "idle"}`}><i />{selected ? STATUS_LABEL[selected.status] : "Siaga"}</span></div>
            <div className="office-detail-name">{selected?.name ?? "Pilih agen"}<small>{selected ? `${selected.role} · ${selected.horizon}` : "Status tim"}</small></div>
            <div className="office-task-label">TUGAS TERAKHIR</div>
            <p className="office-detail-summary">{selected?.summary ?? "Status agen akan tampil setelah backend terhubung."}</p>
            <div className="office-detail-metrics">
              <span><small>SKOR SINYAL</small><b>{selected?.score == null ? "—" : selected.score.toFixed(2)}</b></span>
              <span><small>KEYAKINAN</small><b>{selected?.confidence == null ? "—" : fmtPct(selected.confidence * 100, 0)}</b></span>
              <span><small>DURASI</small><b>{selected?.durationMs == null ? "—" : `${(selected.durationMs / 1000).toFixed(1)} dtk`}</b></span>
            </div>
            {selected?.lastRunAt && <div className="office-last-run">Terakhir aktif · {fmtDateTime(selected.lastRunAt)}</div>}
          </div>

          <div className="office-run-note"><span className="run-note-icon">↗</span><span><b>Alur kerja analisis</b><small>Ingestion → Technical → Fundamental → Macro → Sentiment → Synth → Risk → Critic</small></span></div>
          <p className="office-readonly-note">Kantor ini hanya menampilkan data dari backend Agent. Tidak ada perintah yang dijalankan dari ruang ini.</p>
        </aside>
      </div>

      {/* ── Pemantauan Portofolio di bawah Ruang Analisa ── */}
      <PortfolioTracker onSelectSymbol={onOpenCheck} />
    </section>
  );
}
