export interface IdxStock {
  symbol: string;
  name: string;
  sector: string;
}

/**
 * Daftar emiten likuid Bursa Efek Indonesia yang dipakai untuk screener,
 * saran simbol, dan keranjang berita. Semua transaksi ditampilkan dalam Rupiah.
 */
export const IDX_UNIVERSE: IdxStock[] = [
  { symbol: "BBCA.JK", name: "Bank Central Asia", sector: "Perbankan" },
  { symbol: "BBRI.JK", name: "Bank Rakyat Indonesia", sector: "Perbankan" },
  { symbol: "BMRI.JK", name: "Bank Mandiri", sector: "Perbankan" },
  { symbol: "BBNI.JK", name: "Bank Negara Indonesia", sector: "Perbankan" },
  { symbol: "BRIS.JK", name: "Bank Syariah Indonesia", sector: "Perbankan" },
  { symbol: "TLKM.JK", name: "Telkom Indonesia", sector: "Telekomunikasi" },
  { symbol: "ISAT.JK", name: "Indosat Ooredoo Hutchison", sector: "Telekomunikasi" },
  { symbol: "EXCL.JK", name: "XL Axiata", sector: "Telekomunikasi" },
  { symbol: "ASII.JK", name: "Astra International", sector: "Otomotif" },
  { symbol: "UNTR.JK", name: "United Tractors", sector: "Alat berat" },
  { symbol: "ADRO.JK", name: "Alamtri Resources", sector: "Energi" },
  { symbol: "PTBA.JK", name: "Bukit Asam", sector: "Energi" },
  { symbol: "PGAS.JK", name: "Perusahaan Gas Negara", sector: "Energi" },
  { symbol: "AADI.JK", name: "Adaro Andalan Indonesia", sector: "Energi" },
  { symbol: "ANTM.JK", name: "Aneka Tambang", sector: "Mineral" },
  { symbol: "MDKA.JK", name: "Merdeka Copper Gold", sector: "Mineral" },
  { symbol: "INCO.JK", name: "Vale Indonesia", sector: "Mineral" },
  { symbol: "BRPT.JK", name: "Barito Pacific", sector: "Petrokimia" },
  { symbol: "TPIA.JK", name: "Chandra Asri Pacific", sector: "Petrokimia" },
  { symbol: "CPIN.JK", name: "Charoen Pokphand Indonesia", sector: "Konsumer" },
  { symbol: "ICBP.JK", name: "Indofood CBP Sukses Makmur", sector: "Konsumer" },
  { symbol: "INDF.JK", name: "Indofood Sukses Makmur", sector: "Konsumer" },
  { symbol: "AMRT.JK", name: "Sumber Alfaria Trijaya", sector: "Ritel" },
  { symbol: "UNVR.JK", name: "Unilever Indonesia", sector: "Konsumer" },
  { symbol: "KLBF.JK", name: "Kalbe Farma", sector: "Kesehatan" },
  { symbol: "SIDO.JK", name: "Sido Muncul", sector: "Kesehatan" },
  { symbol: "SMGR.JK", name: "Semen Indonesia", sector: "Material" },
  { symbol: "TOWR.JK", name: "Sarana Menara Nusantara", sector: "Infrastruktur" },
  { symbol: "GOTO.JK", name: "GoTo Gojek Tokopedia", sector: "Teknologi" },
  { symbol: "EMTK.JK", name: "Elang Mahkota Teknologi", sector: "Teknologi" },
];

export const QUICK_SYMBOLS = IDX_UNIVERSE.slice(0, 6).map((stock) => stock.symbol);

/** Simbol yang dibuka pertama kali di halaman Cek Saham: IHSG (indeks gabungan). */
export const DEFAULT_CHECK_SYMBOL = "^JKSE";

/** True untuk indeks (mis. ^JKSE) yang tidak punya laporan keuangan emiten. */
export function isIndexSymbol(symbol: string): boolean {
  const value = symbol.trim().toUpperCase();
  return value.startsWith("^") || value === "JKSE" || value === "IHSG";
}

/** Terima ketikan "IHSG" / "JKSE" dan ubah ke simbol Yahoo Finance. */
export function normalizeSymbolInput(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === "IHSG" || value === "JKSE") return "^JKSE";
  return value;
}

/** Label pendek untuk tampilan: "^JKSE" → "IHSG", "BBCA.JK" → "BBCA". */
export function displaySymbol(symbol: string): string {
  const value = symbol.trim().toUpperCase();
  if (value === "^JKSE" || value === "JKSE") return "IHSG";
  return value.replace(/\.JK$/, "");
}

export const NEWS_MARKET_SYMBOLS = [
  "^JKSE",
  "BBCA.JK",
  "BBRI.JK",
  "BMRI.JK",
  "TLKM.JK",
  "ASII.JK",
];

const BY_SYMBOL = new Map(IDX_UNIVERSE.map((stock) => [stock.symbol, stock]));

export function stockInfo(symbol: string): IdxStock | null {
  return BY_SYMBOL.get(symbol.toUpperCase()) ?? null;
}

export function stockName(symbol: string): string {
  return stockInfo(symbol)?.name ?? symbol.replace(/\.JK$/i, "").replace(/^\^/, "");
}

export function sectorOf(symbol: string): string {
  return stockInfo(symbol)?.sector ?? "Lainnya";
}
