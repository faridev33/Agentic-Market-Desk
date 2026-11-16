/**
 * Debug script untuk menguji koneksi Yahoo Finance
 * Jalankan: npx tsx backend/src/providers/yahoo-debug.ts
 */

import YahooFinance from "yahoo-finance2";

async function testYahooConnection() {
  const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
    versionCheck: false,
  });

  console.log("=== Menguji Koneksi Yahoo Finance ===\n");

  // Test 1: Coba ambil quote BRIS
  console.log("Test 1: Quote BRIS.JK");
  try {
    const quote = await yf.quote("BRIS.JK", {}, { validateResult: false });
    console.log("✓ Berhasil:", JSON.stringify(quote, null, 2));
  } catch (error) {
    console.log("✗ Gagal:", error);
  }

  // Test 2: Coba chart BRIS.JK
  console.log("\nTest 2: Chart BRIS.JK (6mo)");
  try {
    const chart = await yf.chart("BRIS.JK", {
      period1: new Date(Date.now() - 186 * 86400000),
      interval: "1d",
      events: "div|split",
    }, { validateResult: false });
    console.log("✓ Berhasil:", JSON.stringify(chart, null, 2));
  } catch (error) {
    console.log("✗ Gagal:", error);
  }

  // Test 3: Coba search BRIS
  console.log("\nTest 3: Search BRIS");
  try {
    const search = await yf.search("BRIS", {
      quotesCount: 5,
      newsCount: 0,
      enableFuzzyQuery: false,
    }, { validateResult: false });
    console.log("✓ Berhasil:", JSON.stringify(search, null, 2));
  } catch (error) {
    console.log("✗ Gagal:", error);
  }

  // Test 4: Coba format lain (.JK, no suffix)
  console.log("\nTest 4: Format alternatif");
  const formats = ["BRIS", "BRIS.JK", "BRIS.KL"];
  for (const format of formats) {
    console.log(`  Mencoba ${format}...`);
    try {
      const result = await yf.quote(format, {}, { validateResult: false });
      console.log(`  ✓ ${format}:`, JSON.stringify(result, null, 2));
      break;
    } catch (error) {
      console.log(`  ✗ ${format} gagal`);
    }
  }

  // Test 5: Cek apakah ada data IHSG
  console.log("\nTest 5: IHSG index (^JKSE)");
  try {
    const index = await yf.quote("^JKSE", {}, { validateResult: false });
    console.log("✓ Berhasil:", JSON.stringify(index, null, 2));
  } catch (error) {
    console.log("✗ Gagal:", error);
  }
}

testYahooConnection().catch(console.error);
