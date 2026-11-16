export interface LexiconTerm {
  phrase: string;
  weight: number;
}

export const POSITIVE_TERMS: LexiconTerm[] = [
  { phrase: "beat estimates", weight: 1.5 },
  { phrase: "beats estimates", weight: 1.5 },
  { phrase: "beats expectations", weight: 1.5 },
  { phrase: "raised guidance", weight: 1.5 },
  { phrase: "raises guidance", weight: 1.5 },
  { phrase: "record high", weight: 1.2 },
  { phrase: "record profit", weight: 1.3 },
  { phrase: "share buyback", weight: 1.2 },
  { phrase: "dividend increase", weight: 1.2 },
  { phrase: "price target raised", weight: 1.2 },
  { phrase: "upgraded to", weight: 1.2 },
  { phrase: "strong demand", weight: 1.1 },
  { phrase: "better than expected", weight: 1.3 },
  { phrase: "beat", weight: 0.9 },
  { phrase: "beats", weight: 0.9 },
  { phrase: "raised", weight: 0.7 },
  { phrase: "surge", weight: 0.9 },
  { phrase: "surges", weight: 0.9 },
  { phrase: "soar", weight: 0.9 },
  { phrase: "soars", weight: 0.9 },
  { phrase: "rally", weight: 0.8 },
  { phrase: "rallies", weight: 0.8 },
  { phrase: "record", weight: 0.6 },
  { phrase: "growth", weight: 0.5 },
  { phrase: "profit", weight: 0.5 },
  { phrase: "profits", weight: 0.5 },
  { phrase: "upgrade", weight: 0.8 },
  { phrase: "upgraded", weight: 0.8 },
  { phrase: "outperform", weight: 0.9 },
  { phrase: "bullish", weight: 0.9 },
  { phrase: "strong", weight: 0.6 },
  { phrase: "wins", weight: 0.6 },
  { phrase: "win", weight: 0.5 },
  { phrase: "approval", weight: 0.6 },
  { phrase: "approved", weight: 0.6 },
  { phrase: "partnership", weight: 0.5 },
  { phrase: "expansion", weight: 0.5 },
  { phrase: "buyback", weight: 0.7 },
  { phrase: "dividend", weight: 0.4 },
  { phrase: "gain", weight: 0.4 },
  { phrase: "gains", weight: 0.4 },
  { phrase: "jump", weight: 0.6 },
  { phrase: "jumps", weight: 0.6 },
  { phrase: "climb", weight: 0.4 },
  { phrase: "climbs", weight: 0.4 },
  // Istilah Bahasa Indonesia (Positif)
  { phrase: "laba melonjak", weight: 1.5 },
  { phrase: "laba bersih naik", weight: 1.4 },
  { phrase: "laba meroket", weight: 1.5 },
  { phrase: "rekor laba", weight: 1.5 },
  { phrase: "dividen jumbo", weight: 1.6 },
  { phrase: "dividen interim", weight: 1.3 },
  { phrase: "tebar dividen", weight: 1.2 },
  { phrase: "inflow asing", weight: 1.2 },
  { phrase: "top net buy", weight: 1.3 },
  { phrase: "net buy", weight: 1.1 },
  { phrase: "borong saham", weight: 1.2 },
  { phrase: "akumulasi saham", weight: 1.1 },
  { phrase: "menguat", weight: 0.7 },
  { phrase: "melesat", weight: 1.0 },
  { phrase: "meroket", weight: 1.2 },
  { phrase: "kinerja moncer", weight: 1.3 },
  { phrase: "kinerja positif", weight: 1.0 },
  { phrase: "tumbuh positif", weight: 0.9 },
  { phrase: "surplus", weight: 0.8 },
  { phrase: "rebound", weight: 0.9 },
  { phrase: "rights issue sukses", weight: 1.1 },
  { phrase: "buyback saham", weight: 1.2 },
  { phrase: "akuisisi", weight: 1.0 },
  { phrase: "rekomendasi beli", weight: 1.1 },
  { phrase: "target harga naik", weight: 1.2 },
];

export const NEGATIVE_TERMS: LexiconTerm[] = [
  { phrase: "missed estimates", weight: 1.5 },
  { phrase: "misses estimates", weight: 1.5 },
  { phrase: "missed expectations", weight: 1.5 },
  { phrase: "cut guidance", weight: 1.5 },
  { phrase: "cuts guidance", weight: 1.5 },
  { phrase: "profit warning", weight: 1.5 },
  { phrase: "class action", weight: 1.4 },
  { phrase: "short seller", weight: 1.4 },
  { phrase: "data breach", weight: 1.3 },
  { phrase: "accounting irregularities", weight: 1.6 },
  { phrase: "price target cut", weight: 1.2 },
  { phrase: "downgraded to", weight: 1.2 },
  { phrase: "ceo resigns", weight: 1.2 },
  { phrase: "job cuts", weight: 1.1 },
  { phrase: "worse than expected", weight: 1.3 },
  { phrase: "delisting", weight: 1.4 },
  { phrase: "miss", weight: 0.8 },
  { phrase: "misses", weight: 0.9 },
  { phrase: "plunge", weight: 0.9 },
  { phrase: "plunges", weight: 0.9 },
  { phrase: "slump", weight: 0.9 },
  { phrase: "slumps", weight: 0.9 },
  { phrase: "fall", weight: 0.4 },
  { phrase: "falls", weight: 0.5 },
  { phrase: "drop", weight: 0.5 },
  { phrase: "drops", weight: 0.5 },
  { phrase: "decline", weight: 0.5 },
  { phrase: "declines", weight: 0.5 },
  { phrase: "loss", weight: 0.7 },
  { phrase: "losses", weight: 0.7 },
  { phrase: "downgrade", weight: 0.8 },
  { phrase: "downgraded", weight: 0.8 },
  { phrase: "underperform", weight: 0.9 },
  { phrase: "bearish", weight: 0.9 },
  { phrase: "weak", weight: 0.6 },
  { phrase: "lawsuit", weight: 0.8 },
  { phrase: "probe", weight: 0.8 },
  { phrase: "investigation", weight: 0.8 },
  { phrase: "fraud", weight: 1.2 },
  { phrase: "bankruptcy", weight: 1.3 },
  { phrase: "bankrupt", weight: 1.2 },
  { phrase: "default", weight: 1.1 },
  { phrase: "layoffs", weight: 0.8 },
  { phrase: "cut", weight: 0.4 },
  { phrase: "cuts", weight: 0.5 },
  { phrase: "warning", weight: 0.6 },
  { phrase: "recall", weight: 0.8 },
  { phrase: "delay", weight: 0.6 },
  { phrase: "halt", weight: 0.7 },
  { phrase: "resign", weight: 0.7 },
  { phrase: "resigns", weight: 0.7 },
  { phrase: "scandal", weight: 1.1 },
  { phrase: "fine", weight: 0.5 },
  { phrase: "penalty", weight: 0.6 },
  { phrase: "dilution", weight: 0.7 },
  // Istilah Bahasa Indonesia (Negatif)
  { phrase: "rugi bersih", weight: 1.5 },
  { phrase: "laba anjlok", weight: 1.5 },
  { phrase: "terjun bebas", weight: 1.4 },
  { phrase: "terjun", weight: 1.0 },
  { phrase: "anjlok", weight: 1.2 },
  { phrase: "merosot", weight: 1.0 },
  { phrase: "terpuruk", weight: 1.1 },
  { phrase: "ambles", weight: 1.1 },
  { phrase: "tertekan", weight: 0.8 },
  { phrase: "pelemahan rupiah", weight: 0.9 },
  { phrase: "gagal bayar", weight: 1.6 },
  { phrase: "peringatan pailit", weight: 1.6 },
  { phrase: "pailit", weight: 1.5 },
  { phrase: "pkpu", weight: 1.3 },
  { phrase: "suspensi saham", weight: 1.5 },
  { phrase: "suspensi", weight: 1.3 },
  { phrase: "delisting", weight: 1.5 },
  { phrase: "outflow asing", weight: 1.1 },
  { phrase: "net sell", weight: 1.0 },
  { phrase: "jual bersih", weight: 0.9 },
  { phrase: "sanksi bei", weight: 1.2 },
  { phrase: "pemutusan hubungan kerja", weight: 1.1 },
  { phrase: "phk", weight: 1.0 },
  { phrase: "korupsi", weight: 1.3 },
  { phrase: "kejagung", weight: 1.1 },
  { phrase: "gugatan", weight: 1.0 },
  { phrase: "kasus", weight: 0.6 },
];

export interface EventPattern {
  event: string;
  impact: number;
  patterns: RegExp[];
}

export const EVENT_PATTERNS: EventPattern[] = [
  {
    event: "earnings",
    impact: 0.85,
    patterns: [
      /\bearnings?\b/i,
      /\bestimates?\b/i,
      /quarterly results/i,
      /\bq[1-4]\b.*results/i,
      /laba (bersih|operasional|usaha)/i,
      /rugi (bersih|operasional)/i,
      /kinerja keuangan/i,
      /pendapatan (naik|turun|melonjak|merosot)/i,
    ],
  },
  { event: "guidance", impact: 0.75, patterns: [/guidance/i, /\bforecast\b/i, /\boutlook\b/i, /proyeksi/i, /target 202[0-9]/i] },
  { event: "dividend", impact: 0.8, patterns: [/dividend/i, /payout/i, /dividen (jumbo|interim|final|tunai)/i, /tebar dividen/i, /cum date/i] },
  { event: "buyback", impact: 0.75, patterns: [/buyback/i, /repurchase/i, /beli kembali saham/i] },
  {
    event: "mna",
    impact: 0.85,
    patterns: [/merger/i, /acquisition/i, /takeover/i, /stake sale/i, /akuisisi/i, /caplok/i, /ambil alih/i, /tender offer/i, /divestasi/i],
  },
  {
    event: "legal",
    impact: 0.8,
    patterns: [/lawsuit/i, /investigation/i, /probe/i, /class action/i, /fraud/i, /penalt/i, /korupsi/i, /kejagung/i, /kpk/i, /gugatan/i, /sanksi/i],
  },
  {
    event: "regulatory",
    impact: 0.8,
    patterns: [/regulator/i, /\bsec\b/i, /antitrust/i, /\bfda\b/i, /approval/i, /regulasi/i, /ojk/i, /bei/i, /izin usaha/i, /aturan baru/i],
  },
  {
    event: "macro_policy",
    impact: 0.9,
    patterns: [/suku bunga/i, /bi rate/i, /the fed/i, /inflasi/i, /msci/i, /danantara/i, /kurs rupiah/i, /devaluasi/i, /downgrade warning/i],
  },
  {
    event: "analyst_rating",
    impact: 0.6,
    patterns: [/upgrade/i, /downgrade/i, /price target/i, /initiates? coverage/i, /rekomendasi (beli|jual|hold)/i, /target harga/i],
  },
  {
    event: "management",
    impact: 0.65,
    patterns: [/\bceo\b/i, /\bcfo\b/i, /resign/i, /appoint/i, /direktur utama/i, /komisaris/i, /perombakan direksi/i, /rups/i, /rupslb/i],
  },
  {
    event: "distress",
    impact: 1.0,
    patterns: [/bankrupt/i, /\bdefault\b/i, /insolven/i, /delisting/i, /pailit/i, /gagal bayar/i, /suspensi/i, /pkpu/i, /kebangkrutan/i, /krisis likuiditas/i],
  },
  { event: "layoffs", impact: 0.6, patterns: [/layoff/i, /job cuts/i, /restructur/i, /phk/i, /pemangkasan karyawan/i] },
  {
    event: "product",
    impact: 0.55,
    patterns: [/launch/i, /partnership/i, /contract win/i, /breakthrough/i, /kontrak baru/i, /proyek baru/i, /ekspansi/i, /pabrik baru/i],
  },
];

export interface ScoredNewsMetadata {
  impactScore: number;
  impactLevel: "critical" | "high" | "medium" | "low" | "minimal";
  impactLabel: string;
  sentiment: "positive" | "neutral" | "negative";
  events: string[];
}

export function scoreNewsImpact(title: string): ScoredNewsMetadata {
  const text = title.toLowerCase();

  // 1. Deteksi events & raw impact
  const events = new Set<string>();
  let maxPatternImpact = 0.25;

  for (const ep of EVENT_PATTERNS) {
    if (ep.patterns.some((pattern) => pattern.test(title))) {
      events.add(ep.event);
      maxPatternImpact = Math.max(maxPatternImpact, ep.impact);
    }
  }

  // 2. Deteksi sentimen
  let positiveScore = 0;
  for (const term of POSITIVE_TERMS) {
    if (text.includes(term.phrase)) positiveScore += term.weight;
  }
  let negativeScore = 0;
  for (const term of NEGATIVE_TERMS) {
    if (text.includes(term.phrase)) negativeScore += term.weight;
  }

  const rawSentiment = positiveScore - negativeScore;
  const sentiment: "positive" | "neutral" | "negative" =
    rawSentiment > 0.4 ? "positive" : rawSentiment < -0.4 ? "negative" : "neutral";

  // 3. Hitung point pengaruh 1 - 5 (Skor 5 jika sangat berpengaruh)
  // Bobot materialitas berita:
  let impactScore = 2; // baseline

  const isDistress = events.has("distress");
  const isMacroCritical = events.has("macro_policy") && (text.includes("msci") || text.includes("bi rate") || text.includes("suku bunga") || text.includes("danantara") || text.includes("downgrade"));
  const isMegaEarningsOrDividend =
    (events.has("earnings") && (text.includes("melonjak") || text.includes("meroket") || text.includes("anjlok") || text.includes("rekor") || text.includes("terjun"))) ||
    (events.has("dividend") && (text.includes("jumbo") || text.includes("interim") || text.includes("tebar")));
  const isMegaMnaOrLegal =
    (events.has("mna") && (text.includes("akuisisi") || text.includes("caplok") || text.includes("merger") || text.includes("ambil alih"))) ||
    (events.has("legal") && (text.includes("korupsi") || text.includes("kejagung") || text.includes("gugatan")));

  if (isDistress || isMacroCritical || isMegaEarningsOrDividend || isMegaMnaOrLegal) {
    impactScore = 5;
  } else if (
    maxPatternImpact >= 0.75 ||
    events.has("earnings") ||
    events.has("dividend") ||
    events.has("buyback") ||
    events.has("mna") ||
    Math.abs(rawSentiment) >= 2.0
  ) {
    impactScore = 4;
  } else if (
    maxPatternImpact >= 0.55 ||
    events.has("analyst_rating") ||
    events.has("management") ||
    events.has("product") ||
    Math.abs(rawSentiment) >= 0.8
  ) {
    impactScore = 3;
  } else if (maxPatternImpact >= 0.4 || events.size > 0 || Math.abs(rawSentiment) > 0) {
    impactScore = 2;
  } else {
    impactScore = 1;
  }

  const impactLevelMap: Record<number, ScoredNewsMetadata["impactLevel"]> = {
    5: "critical",
    4: "high",
    3: "medium",
    2: "low",
    1: "minimal",
  };

  const impactLabelMap: Record<number, string> = {
    5: "Sangat Berpengaruh",
    4: "Berpengaruh Kuat",
    3: "Berpengaruh Sedang",
    2: "Pengaruh Ringan",
    1: "Kurang Berpengaruh",
  };

  return {
    impactScore,
    impactLevel: impactLevelMap[impactScore] ?? "medium",
    impactLabel: impactLabelMap[impactScore] ?? "Berpengaruh Sedang",
    sentiment,
    events: [...events],
  };
}
