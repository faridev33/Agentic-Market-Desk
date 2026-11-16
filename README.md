# Agentic Market Desk

![Node.js](https://img.shields.io/badge/Node.js-20%2B%20%7C%2022.5%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-Backend-000000?logo=fastify&logoColor=white)
![React](https://img.shields.io/badge/React-18%20%2B%20Vite-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-Storage-003B57?logo=sqlite&logoColor=white)

Sistem multi-agen berbasis **LLM + Kuantitatif Deterministik (Neuro-Symbolic)** untuk analisis dan prediksi saham Bursa Efek Indonesia (BEI/IDX). Dibangun dengan backend **Fastify**, frontend **React/Vite** (termasuk visualisasi kantor 3D), serta seluruh metrik mata uang dalam **Rupiah (IDR)**.

![Arsitektur Sistem](ARSITEKTUR_AGENTIC_DIAGRAM.svg)

---

## Daftar Isi

- [1. Ringkasan & Filosofi](#1-ringkasan--filosofi)
- [2. Fitur Utama](#2-fitur-utama)
- [3. Struktur Folder](#3-struktur-folder)
- [4. Instalasi & Menjalankan](#4-instalasi--menjalankan)
- [5. Sumber Data (3 Pilar)](#5-sumber-data-3-pilar)
- [6. Arsitektur 8 Agen](#6-arsitektur-8-agen)
- [7. Protokol Audit 13 Aturan (Contrarian Critic)](#7-protokol-audit-13-aturan-contrarian-critic)
- [8. Manajemen Risiko: 6 Kendala](#8-manajemen-risiko-6-kendala)
- [9. Pipeline End-to-End](#9-pipeline-end-to-end)
- [10. Stack Teknologi & Referensi API](#10-stack-teknologi--referensi-api)
- [11. Status Implementasi](#11-status-implementasi)
- [12. Keterbatasan & Catatan Evaluasi](#12-keterbatasan--catatan-evaluasi)

---

## 1. Ringkasan & Filosofi

Bayangkan sebuah kantor investasi yang mempekerjakan **8 pakar AI** yang bekerja 24 jam menyaring saham BEI. Pendekatan hibrida ini dirancang untuk mengatasi kelemahan fundamental dari masing-masing metode tunggal di pasar modal:

1. **ML / Statistik Murni** sering terjebak hipotesis pasar efisien semi-kuat — indikator teknikal historis murni umumnya hanya menghasilkan akurasi arah **49%–53%** pada emiten likuid LQ45.
2. **LLM Tunggal** rentan terhadap halusinasi numerik saat membaca laporan keuangan, mengalami *reasoning-action misalignment* (argumen hati-hati tetapi eksekusi agresif), serta tidak memiliki kendala manajemen risiko kuantitatif.

Solusinya adalah **Neuro-Symbolic Architecture**:
- **Lapisan Simbolik Deterministik:** Perhitungan SMA, RSI, MACD, ATR, Z-score, ROE, PER, Kelly Criterion, dan batas eksposur dihitung secara matematis. Angka tidak pernah dikarang oleh LLM.
- **Lapisan Kognitif LLM:** Membaca semantik berita keuangan berbahasa Indonesia serta bertindak sebagai *adversarial red-team* yang menantang konsensus.
- **Konsensus & Supervisi Transisi:** Sinyal beli hanya diterbitkan apabila keyakinan gabungan melewati ambang batas dan lolos dari **13 filter audit deterministik**.

---

## 2. Fitur Utama

- **Kantor Virtual 3D:** Ruang kerja interaktif berbasis Three.js yang menampilkan status aktivitas ke-8 agen secara *real-time*.
- **Screener Pasar:** Memindai emiten IDX likuid dengan filter arah harga, sektor, pencarian simbol, dan pengurutan rasio.
- **Agregasi Berita:** Pemantauan kabar pasar IDX dan emiten terkait lengkap dengan filter topik dan skor dampak sentimen.
- **Cek Saham (Tanpa LLM):** Pengecekan instan berisi grafik interaktif, ringkasan 52 minggu, 40 rasio valuasi & profitabilitas, kinerja keuangan tahunan, serta profil bisnis.
- **Analisa Top Picks:** 5 emiten rekomendasi beli hasil musyawarah 8 agen dari pemindaian ~956 emiten IDX, lengkap dengan skor konsensus, suara tiap agen, rencana *entry/SL/TP*, indikator teknikal, dan alur metodologi.
- **Jalankan Analisis Kustom:** Menjalankan pipeline 8 agen terhadap emiten pilihan sendiri dengan kustomisasi modal, horizon (*Trading* / *Investasi*), manajemen risiko ATR/Kelly, dan panel makro.
- **Antarmuka Adaptif & Rupiah:** Mendukung tema terang/gelap (*persistent* sebelum render) dengan format harga, kapitalisasi pasar, nilai posisi, dan batas risiko dalam **IDR**.

---

## 3. Struktur Folder

```text
Agent/
├── backend/              # API Fastify, mesin 8 agen, SQLite
│   ├── src/
│   │   ├── agents/       # Logika agen (dataIngestion, technical, fundamental, macro,
│   │   │                 # sentiment, quantMomentum, critic, synthesizer, riskManager)
│   │   ├── api/          # Endpoint rute /v1/*
│   │   ├── backtest/     # Engine simulasi, metrik, walk-forward validation
│   │   ├── data/         # idxUniverse.ts, idxCompanies.ts (~956 emiten BEI)
│   │   ├── lib/          # Indikator teknikal, utilitas matematika, error, logger
│   │   ├── llm/          # Klien integrasi LLM
│   │   ├── providers/    # Yahoo Finance, RSS berita, TTL cache, types
│   │   ├── services/     # Orkestrasi analysis, screener, topPicks, quality, backtest
│   │   └── storage/      # Persistensi decisions & portfolio (SQLite)
│   ├── tests/            # 7 berkas unit & integration test (tsx --test)
│   ├── tmp_eval/         # Artefak evaluasi (results.json, summary.json)
│   ├── data/             # app.db, screener-cache.json, top-picks.json (runtime)
│   └── .env.example
├── frontend/             # UI React + Vite
│   └── src/              # components/, office3d/, api.ts, theme.ts
├── jurnal_assets/        # Aset visual & skrip generator grafik (figs.py, stats.py)
├── ARSITEKTUR_AGENTIC_DIAGRAM.mmd
├── ARSITEKTUR_AGENTIC_DIAGRAM.svg
└── package.json          # Skrip orkestrasi monorepo root
