import { TopPicksSection } from "./TopPicksPanel";
import { useTopPicks } from "../useTopPicks";
import { Badge, Card, Section } from "./ui";
import { fmtDateTime } from "../format";
import { DataUpdatedAt } from "./DataUpdatedAt";

const METHOD_STEPS = [
  {
    step: "1",
    title: "Pindai seluruh IDX",
    desc: "956 emiten diambil harga & likuiditasnya dari Yahoo Finance dalam hitungan detik, bukan sampel 30 emiten.",
  },
  {
    step: "2",
    title: "Saring likuiditas",
    desc: "Hanya emiten dengan nilai transaksi harian cukup dan histori ≥60 candle yang lolos, supaya rencana entry/exit realistis.",
  },
  {
    step: "3",
    title: "Hitung indikator",
    desc: "SMA 20/50/200, RSI 14, ATR, volatilitas, return 1/3/6 bulan, volume ratio, drawdown, dan jarak ke puncak 52 minggu.",
  },
  {
    step: "4",
    title: "16 finalis ke 8 agen",
    desc: "Tiap agen memberi suara berisi kode emiten, horizon, dan tingkat keyakinan 0–100. Model LLM bisa berbeda per agen.",
  },
  {
    step: "5",
    title: "Konsensus & rencana",
    desc: "Skor = keyakinan rata-rata × faktor jumlah suara × 0,85 + skor heuristik × 0,15. Entry, stop loss, dan target diturunkan dari ATR.",
  },
] as const;

export interface AnalisaPageProps {
  onSelectSymbol: (symbol: string) => void;
  onAnalyzeSymbol: (symbol: string) => void;
}

export function AnalisaPage({ onSelectSymbol, onAnalyzeSymbol }: AnalisaPageProps) {
  const topPicks = useTopPicks();
  const result = topPicks.result;

  return (
    <div className="analisa-solo">
      <Card className="hero analisa-hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Halaman khusus</p>
            <h1>
              5 Emiten Rekomendasi Beli
              <span className="hero-name">konsensus 8 agen AI</span>
            </h1>
            <p className="hero-sub">
              {result
                ? `${result.picks.length} emiten dari ${result.universe.total} emiten IDX · ${result.agentsOk}/8 agen bersuara · snapshot ${fmtDateTime(result.generatedAt)}`
                : "Belum ada snapshot. Jalankan pemindaian untuk menyusun daftar pertama."}
            </p>
          </div>
          <div className="hero-side">
            <Badge tone="info">Konsensus 8 AI</Badge>
            {result ? <Badge tone="muted">{Math.round(result.durationMs / 1000)}s</Badge> : null}
          </div>
        </div>
        <p className="hero-foot">
          Daftar ini disusun dari data publik Yahoo Finance dan penilaian model bahasa. Skor konsensus
          belum terkalibrasi terhadap hasil nyata — bukan nasihat keuangan.
        </p>
      </Card>

      <DataUpdatedAt
        timestamps={[
          { iso: result?.generatedAt, label: "Snapshot rekomendasi" },
          { iso: topPicks.progress?.finishedAt, label: "Scan selesai" },
          { iso: topPicks.progress?.updatedAt, label: "Status terakhir" },
        ]}
      />

      <TopPicksSection
        state={topPicks}
        currentSymbol=""
        onSelect={onSelectSymbol}
        onAnalyze={onAnalyzeSymbol}
      />

      <Section
        eyebrow="Metode"
        title="Bagaimana 5 emiten ini disusun"
        aside={<span className="section-note">dari 956 emiten menjadi 5</span>}
      >
        <div className="funnel-grid">
          {METHOD_STEPS.map((item) => (
            <Card key={item.step} className="funnel-step">
              <b>{item.step}</b>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </Card>
          ))}
        </div>
      </Section>

      {result && result.notes.length > 0 ? (
        <Section eyebrow="Catatan proses" title="Jejak penyaringan">
          <ul className="thesis">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
