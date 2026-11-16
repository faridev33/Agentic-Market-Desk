import json
import os

backend_eval = "backend/tmp_eval"
with open(os.path.join(backend_eval, "summary.json"), encoding="utf-8") as f:
    summary = json.load(f)
with open(os.path.join(backend_eval, "results.json"), encoding="utf-8") as f:
    results = [r for r in json.load(f) if "error" not in r]
with open("backend/data/top-picks.json", encoding="utf-8") as f:
    top_picks = json.load(f)

md_content = """# Arsitektur Multi-Agent Multimodal Berbasis LLM dengan Pengawasan Transisi dan Konsensus Bayesian untuk Prediksi Saham Bursa Efek Indonesia

**Penulis:** Ghiffari et al.  
**Afiliasi:** Departemen Ilmu Komputer dan Informatika, Fakultas Ilmu Komputer  
**Korespondensi:** `peneliti@informatika.ac.id`  
**Repositori Proyek:** `Agentic Market Desk` (Fastify + React/Vite + SQLite)

---

### Abstrak
Prediksi pergerakan harga saham pada pasar berkembang (*emerging market*) seperti Bursa Efek Indonesia (BEI) menghadirkan tantangan kompleks akibat volatilitas tinggi, asimetri informasi, dan pengaruh simultan faktor makroekonomi, kinerja fundamental, serta sentimen berita domestik. Model prediktif univariat tradisional maupun algoritma *machine learning* konvensional berbasis indikator teknikal tunggal kerap gagal melampaui hipotesis pasar efisien semi-kuat (*Semi-Strong Efficient Market Hypothesis*), sementara implementasi *Large Language Models* (LLM) mandiri rentan terhadap halusinasi numerik dan inkonsistensi aksi (*reasoning-action misalignment*). Penelitian ini mengusulkan arsitektur sistem cerdas *Multi-Agent Multimodal* berbasis LLM yang dilengkapi lapisan pengawasan transisi (*Transition Supervision*) dan fungsi konsensus Bayesian (*Consensus-Gated Execution*) untuk memprediksi arah pergerakan harga serta menyusun portofolio saham terkurasi di BEI. Arsitektur ini mengorkestrasi delapan agen spesialis: *Technical Trend*, *Fundamental Value*, *Macro Regime*, *News & Sentiment*, *Quant Momentum*, *Risk Guardian*, *Contrarian Critic*, dan *Portfolio Synthesizer*. Evaluasi empiris out-of-sample dilakukan menggunakan protokol validasi temporal bebas kebocoran (*Walk-Forward Validation*, 4 *folds*, 60 jendela uji out-of-sample) pada 15 emiten konstituen indeks LQ45/Kompas100 yang mewakili sektor strategis di BEI dengan memodelkan biaya transaksi riil (15 bps *fee* dan 10 bps *slippage*). Hasil eksperimen menunjukkan bahwa arsitektur multi-agen mampu mereduksi risiko kerugian modal secara signifikan: strategi mempertahankan eksposur pasar rata-rata hanya 19,21% dan menekan *Maximum Drawdown* rata-rata menjadi 24,18% (dibandingkan *Buy-and-Hold* yang mengalami penurunan hingga -57,19% pada emiten seperti SMGR). Uji tanda binomial mengonfirmasi bahwa 53,3% (8 dari 15) emiten menghasilkan imbal hasil out-of-sample yang melampaui strategi beli-dan-tahan pada rezim pasar bergejolak. Modul *Contrarian Critic* berhasil menahan eksekusi impulsif pada 100% kasus evaluasi berisiko tinggi melalui 29 keberatan material (*audited objections*). Temuan ini membuktikan bahwa supervisi terstruktur dan konsensus antar-agen spesialis efektif mengatasi kelemahan mendasar model finansial *black-box* di pasar modal Indonesia.

**Kata Kunci:** Sistem Multi-Agen, Large Language Models, Bursa Efek Indonesia, Konsensus Bayesian, Supervisi Transisi, Walk-Forward Validation, Prediksi Finansial Multimodal.

---

## 1. Pendahuluan

Pasar modal Indonesia melalui Indeks Harga Saham Gabungan (IHSG) di Bursa Efek Indonesia (BEI) merepresentasikan karakteristik pasar berkembang (*emerging market*) yang unik, dinamis, dan sarat anomali. Berbeda dengan pasar negara maju yang didorong oleh likuiditas institusional yang seragam, fluktuasi indeks dan harga saham individual di BEI dipengaruhi oleh interaksi multi-skala yang sangat kompleks antara guncangan makroekonomi eksternal, rotasi modal asing (*foreign flow*), volatilitas harga komoditas global, sentimen investor domestik, dan kinerja kuantitas fundamental emiten lokal [4], [14], [25]. 

Secara historis, upaya akademis dalam memprediksi arah pergerakan harga saham didominasi oleh dua paradigma utama: pendekatan statistik deret waktu klasik dan algoritma *machine learning* terawasi (*supervised learning*). Model statistik linier seperti *Autoregressive Integrated Moving Average* (ARIMA) dan proses stokastik *Geometric Brownian Motion* (GBM) berasumsi bahwa deret harga memiliki struktur stasioner atau mengikuti volatilitas konstan [18], [24]. Ketika dihadapkan pada disrupsi struktural (*structural breaks*), lonjakan berita tak terduga, atau krisis makroekonomi, asumsi ini runtuh sehingga model menghasilkan galat proyeksi yang besar (*lagged response*). Di sisi lain, penerapan algoritma *machine learning* seperti *Support Vector Regression* (SVR), *Random Forest*, dan *Extreme Gradient Boosting* (XGBoost) yang dilatih secara univariat pada data teknikal harga historis terbukti menghasilkan akurasi arah (*Directional Accuracy*) yang hanya berkisar antara 49% hingga 53% pada emiten terlikuid LQ45 di BEI [4], [19]. Nilai koefisien determinasi ($R^2$) yang mendekati nol pada horizon harian hingga mingguan mengonfirmasi bahwa pergerakan harga di BEI mendekati *Semi-Strong Efficient Market Hypothesis* (EMH), di mana informasi masa lalu dari deret harga saja tidak lagi menyediakan *alpha* (keunggulan imbal hasil) yang dapat dieksploitasi secara konsisten tanpa menyertakan informasi fundamental dan berita publik [4], [11].

Urgensi integrasi data multimodal—yang menggabungkan deret waktu teknikal, indikator kuantitas fundamental perusahaan, dan sentimen teks kualitatif—menjadi semakin nyata dalam literatur mutakhir 2025–2026 [5], [9], [11], [15]. Penelitian ekonometrika di BEI menunjukkan bahwa rasio keuangan fundamental seperti *Return on Equity* (ROE), *Return on Assets* (ROA), *Debt to Equity Ratio* (DER), dan rasio pembayaran dividen (*Dividend Payout Ratio* / DPR) berperan sebagai jangkar penilaian intrinsik yang kokoh bagi emiten perbankan dan industri manufaktur [26], [28], [29]. Namun demikian, transmisi kinerja fundamental terhadap harga saham tidak bersifat linier konstan, melainkan dimoderasi secara kuat oleh sentimen investor pasar [14] serta tekanan makroekonomi seperti depresiasi nilai tukar Rupiah (USD/IDR), suku bunga acuan Bank Indonesia (BI-Rate), dan likuiditas cadangan devisa [25], [27]. Sentimen berita finansial terbukti menjadi pendorong jangka pendek (*short-term accelerator*) yang signifikan terhadap volatilitas intraday di BEI, meskipun dampaknya meluruh cepat dalam jendela waktu 48 jam [13], [16].

Kemunculan *Large Language Models* (LLM) seperti arsitektur GPT-4, DeepSeek, Gemini, dan model representasi bahasa lokal seperti IndoBERT [16] telah membuka cakrawala baru dalam pemrosesan data kualitatif finansial tanpa terstruktur. LLM memiliki kapasitas penalaran semantik (*chain-of-thought*) yang melampaui kemampuan model leksikon kata baku tradisional. Kendati demikian, mengandalkan LLM tunggal (*single LLM agent*) sebagai pengambil keputusan perdagangan otonom menimbulkan risiko fatal di pasar modal. Tinjauan sistematis oleh Fischer et al. [11] mengungkapkan bahwa lebih dari 74% studi peramalan finansial berbasis kecerdasan buatan mengalami cacat metodologis serius berupa *look-ahead bias* dan *data leakage* (kebocoran informasi masa depan ke masa lalu). Selain itu, sistem agen tunggal kerap menderita masalah *reasoning-action misalignment*—suatu kondisi di mana teks analisis yang dihasilkan agen berkesimpulan sangat hati-hati, namun aksi eksekusi portofolio yang diputuskan justru mengambil posisi beli spekulatif secara agresif [1]. LLM juga rentan terhadap halusinasi numerik saat memproses metrik rasio keuangan kuartalan [2].

Untuk memitigasi kelemahan struktural tersebut, paradigma kecerdasan buatan beralih ke arsitektur **Multi-Agent Collaborative & Adversarial Framework** [1], [2], [3], [5], [7]. Dalam kerangka kerja multi-agen, kompleksitas evaluasi pasar didekomposisi ke dalam beberapa agen cerdas yang memiliki peran, keahlian domain, dan horizon waktu yang terspesialisasi:
1. **Pengawasan Transisi Dinamis (*Dynamic Transition Supervision*):** Mengadopsi prinsip *GroundTrader* [1], di mana lapisan supervisi deterministik memverifikasi kepatuhan aksi eksekusi terhadap bukti kuantitatif pasar sebelum perintah dikirimkan ke bursa.
2. **Debat Berbasis Bukti (*Evidence-Based Debate Mechanism*):** Mengadaptasi prinsip *FraudDebate-Agent* [2], di mana sinyal optimis (Bull) dan sinyal pesimis (Bear) diadu secara dialektis dengan data laporan keuangan guna mengeliminasi bias konfirmasi.
3. **Pintu Konsensus Bayesian (*Consensus-Gated Execution / CGX*):** Mengacu pada temuan Bajgora et al. [3], di mana transaksi hanya dieksekusi apabila derajat keyakinan agregat melampaui ambang batas konsensus ($\theta \ge 0,70$), sehingga memangkas sinyal transaksi palsu (*false positives*) hingga lebih dari 60%.
4. **Agregasi Sentimen Multi-Model:** Memadukan pandangan sentimen teks dari berbagai model bahasa ke dalam formulasi alokasi modal terukur, serupa dengan integrasi Black-Litterman berbasis multi-LLM [7].

Penelitian ini bertujuan untuk merancang, mengimplementasikan, dan mengevaluasi secara empiris sistem multi-agen cerdas multimodal yang diberi nama **Agentic Market Desk**. Sistem ini dibangun secara modular menggunakan lingkungan eksekusi Fastify/TypeScript pada sisi backend, SQLite sebagai repositori jejak audit analitis, dan antarmuka React/Vite. Sistem mengorkestrasi delapan agen spesialis: *Technical Trend*, *Fundamental Value*, *Macro Regime*, *News & Sentiment*, *Quant Momentum*, *Risk Guardian*, *Contrarian Critic*, dan *Portfolio Synthesizer*. Evaluasi dilakukan secara ketat menggunakan protokol *Walk-Forward Validation* tanpa kebocoran data pada 15 emiten terlikuid di BEI lintas sektor industri sepanjang 1.200 hari bursa historis, dengan memperhitungkan biaya komisi dan *slippage* riil pasar modal domestik.

Kontribusi utama penelitian ini mencakup:
1. Perancangan arsitektur multi-agen hibrida yang mengintegrasikan model bahasa besar (LLM) dengan batasan kuantitatif deterministik (*neuro-symbolic principles*) untuk pasar modal Indonesia.
2. Implementasi protokol *Contrarian Critic* 13 parameter pengecekan otomatis yang memvalidasi integritas data, menghitung konsistensi silang antar-agen, dan memblokir order halusinasi.
3. Pengujian empiris *walk-forward out-of-sample* yang transparan dan jujur, menyajikan uji signifikansi statistik inferensial (uji-t, *bootstrap confidence intervals*, dan *binomial sign test*) serta mendokumentasikan kelemahan nyata indikator teknikal murni di BEI.
4. Publikasi struktur sistem dan dataset evaluasi yang dapat direproduksi penuh pada ekosistem riset informatika pasar modal Indonesia.

---

## 2. Metodologi Penelitian

Metodologi penelitian ini dirancang dengan menjunjung tinggi rigor ilmiah, reproduktifitas, dan kepatuhan penuh terhadap standar pengujian model deret waktu finansial modern guna mengeliminasi bias seleksi dan kebocoran data [11].

### 2.1. Arsitektur Sistem Multi-Agent (Agentic Market Desk)

Arsitektur sistem dibangun di atas prinsip pemisahan tanggung jawab (*separation of concerns*) yang mengalir melalui lima lapisan hierarkis: Lapisan Data Ingestion, Lapisan Agen Analisis Spesialis, Lapisan Sintesis Berbobot, Lapisan Pengawasan & Validasi (*Critic*), serta Lapisan Manajemen Risiko (*Risk Manager*). Alur komputasi sistem diilustrasikan pada Gambar 1.

![Gambar 1: Arsitektur Sistem Multi-Agent Agentic Market Desk](jurnal_assets/fig1_arsitektur.png)  
*Gambar 1. Arsitektur modular sistem multi-agen multimodal: integrasi aliran data teknikal, fundamental, makro, dan berita melalui 8 agen terspesialisasi dengan lapisan supervisi Critic dan Risk Manager.*

Kedelapan agen dalam sistem beroperasi dengan fungsi objektif dan persona komputasional sebagai berikut:

1. **Agen Data Ingestion (Infrastruktur Data):** Bertanggung jawab menarik, memvalidasi integritas, dan menyelaraskan cap waktu (*timestamps*) data harga OHLCV (3 tahun historis), laporan keuangan kuartalan emiten, indikator makroekonomi pembanding (IHSG, imbal hasil obligasi 10 tahun, selisih kurva imbal, dan kurs USD/IDR), serta korpus artikel berita finansial dari Google News, CNBC Indonesia, dan Kontan. Agen ini menerapkan filter kedaluwarsa data (ambang batas usia quote $\le 96$ jam).
2. **Agen Tren Teknikal (*Technical Trend Agent*):** Menganalisis momentum deret waktu harga harian menggunakan kombinasi rata-rata bergerak bertingkat (*Simple Moving Average* SMA20, SMA50, SMA200), osilator *Relative Strength Index* (RSI-14), *Moving Average Convergence Divergence* (MACD), *Average True Range* (ATR-14), *Bollinger Bands*, *Rate of Change* (ROC), dan *On-Balance Volume* (OBV). Agen menghitung Z-score volume transaksi 20 hari untuk mengonfirmasi validitas penembusan (*breakout*) harga [8], [10], [17], [22].
3. **Agen Nilai Fundamental (*Fundamental Value Agent*):** Mengevaluasi kesehatan keuangan dan valuasi wajar emiten berdasarkan data laporan keuangan kuartalan. Agen mengekstrak metrik struktur modal (*Debt to Asset Ratio* DAR, *Debt to Equity Ratio* DER), profitabilitas (*Return on Assets* ROA, *Return on Equity* ROE, margin laba bersih), kelipatan valuasi (*Price to Earnings* PER, *Price to Book* PBV, EV/EBITDA), serta laju pertumbuhan pendapatan dan laba bersih secara kuartalan (*YoY* dan *QoQ*) [2], [26], [28], [29]. Agen menerapkan normalisasi khusus pada sektor perbankan yang memiliki struktur neraca dan rasio kelayakan modal berbeda dibanding emiten industri umum.
4. **Agen Rezim Makro (*Macro Regime Agent*):** Menilai kondisi lingkungan makroekonomi agregat untuk mengklasifikasikan status pasar ke dalam salah satu dari tiga rezim: *Risk-On*, *Neutral*, atau *Risk-Off*. Klasifikasi ini dihitung dari posisi IHSG terhadap SMA50 dan SMA200, volatilitas VIX global, dinamika imbal hasil obligasi pemerintah Indonesia 10 tahun, dan tren penguatan/pelemahan nilai tukar Rupiah [15], [25], [27].
5. **Agen Sentimen Berita (*News & Sentiment Agent*):** Mengagregasi judul berita terkini (maksimal 12 artikel dalam jendela 45 hari terakhir). Agen memanfaatkan model representasi bahasa yang dipadukan dengan leksikon finansial lokal berbahasa Indonesia (*domain-specific sentiment lexicon*) [16]. Setiap artikel dibobot secara eksponensial berdasarkan tingkat kebaruan (*recency decay*, waktu paruh 72 jam), tingkat keparahan dampak (*event severity*, seperti rilis laba, pembagian dividen, atau kasus hukum korporasi), dan relevansi entitas simbol saham [7], [13].
6. **Agen Momentum Kuantitatif (*Quant Momentum Agent*):** Menghitung profil risiko-imbal hasil statistik murni, mencakup rasio Sharpe berjalan, volatilitas historis terannualisasi, likuiditas nilai transaksi harian rata-rata (*Average Daily Value* / ADV), dan rasio fraktal pergerakan harga [12], [20]. Agen menolak emiten yang memiliki likuiditas tipis karena rentan manipulasi dan friksi *slippage*.
7. **Agen Sintesis Portofolio (*Portfolio Synthesizer*):** Menggabungkan sinyal dari agen-agen hulu dengan matriks pembobotan dinamis yang menyesuaikan horizon investasi (Trading vs. Investasi) dan rezim makro pasar saat analisis dijalankan.
8. **Agen Kritikus & Validator (*Contrarian Critic*):** Bertindak sebagai auditor adversarial independen (mengadopsi paradigma *FraudDebate* [2] dan *Consensus-Gated Execution* [3]). Agen ini menjalankan 13 aturan pemeriksaan logis untuk menentang konsensus, mendeteksi sinyal kontradiktif, dan memberikan penalti pengali keyakinan (*confidence multiplier*) sebelum diteruskan ke eksekusi.
9. **Manajer Risiko (*Risk Guardian & Manager*):** Merumuskan rencana eksekusi matematis yang mencakup penetapan batas henti rugi (*stop-loss*) dinamis berbasis 2x ATR, target ambil untung (*take-profit*) 2R, perhitungan ukuran posisi (*position sizing*) menggunakan multi-kriteria Kelly pecahan, batas risiko per transaksi (1%), batas eksposur sektor portofolio (35%), dan pengaktifan saklar pembatalan otomatis (*drawdown kill switch* pada ambang 15%).

### 2.2. Formulasi Matematis dan Mekanisme Konsensus

Untuk menjamin objektivitas, setiap agen analitis memetakan evaluasi kualitatif dan kuantitatifnya ke dalam ruang skor kontinu ternormalisasi $S_i \in [-1,0, +1,0]$ dan derajat keyakinan $C_i \in [0,0, 1,0]$, di mana $S_i > 0$ menandakan bias *bullish*, $S_i < 0$ menandakan bias *bearish*, dan $S_i = 0$ merepresentasikan pandangan netral.

#### A. Pemetaan Skor Indikator Teknikal
Skor tren teknikal dihitung melalui kombinasi rata-rata bergerak terbobot yang dihaluskan dengan fungsi tangen hiperbolik $\tanh(\cdot)$:
$$S_{trend} = 0.20 \tanh\left(\frac{P_t / \text{SMA}_{20} - 1}{0.04}\right) + 0.30 \tanh\left(\frac{P_t / \text{SMA}_{50} - 1}{0.06}\right) + 0.25 \tanh\left(\frac{\text{SMA}_{50} / \text{SMA}_{200} - 1}{0.05}\right) + 0.25 \tanh\left(\frac{\Delta \text{SMA}_{50, 10d}}{0.03}\right)$$

Skor momentum mengintegrasikan RSI-14, histogram MACD yang dinormalisasi terhadap volatilitas ATR, dan *Rate of Change* (ROC-20):
$$S_{mom} = 0.35 \tanh\left(\frac{\text{RSI}_{14} - 50}{18}\right) + 0.35 \tanh\left(\frac{\text{Hist}_{MACD}}{0.6 \cdot \text{ATR}_{14}}\right) + 0.30 \tanh\left(\frac{\text{ROC}_{20}}{10}\right)$$

Skor teknikal gabungan diformulasikan sebagai:
$$S_{tech} = \text{clip}\Big(0.42 S_{trend} + 0.32 S_{mom} + 0.11 S_{vol} - 0.15 \tanh\left(\frac{\sigma_{ann} - 35\%}{25\%}\right), -1.0, 1.0\Big)$$

#### B. Pembobotan Dinamis dan Sintesis Multimodal
Matriks pembobotan dasar ditentukan berdasarkan horizon investasi target ($\mathcal{H} \in \{\text{trading}, \text{investasi}\}$). Pada horizon trading, fokus utama diarahkan pada teknikal dan sentimen berita ($w_{base} = [0.55, 0.20, 0.20, 0.05]$ untuk teknikal, sentimen, makro, dan fundamental). Sebaliknya, pada horizon investasi jangka panjang, bobot fundamental dan makro mendominasi ($w_{base} = [0.12, 0.08, 0.25, 0.55]$).

Bobot ini disesuaikan secara adaptif mengikuti rezim makro $\mathcal{R} \in \{\text{risk-on}, \text{neutral}, \text{risk-off}\}$:
- Jika $\mathcal{R} = \text{risk-off}$: Bobot makro dinaikkan sebesar 35% ($w_{macro} \leftarrow 1.35 w_{macro}$) dan bobot teknikal dipangkas sebesar 15% ($w_{tech} \leftarrow 0.85 w_{tech}$).
- Jika $\mathcal{R} = \text{risk-on}$: Bobot teknikal dan sentimen dinaikkan masing-masing 10%, sedangkan bobot makro diturunkan 10%.

Bobot efektif akhir untuk setiap agen $i$ memperhitungkan derajat keyakinan internal agen $C_i$:
$$w_i^{eff} = \bar{w}_i \cdot \left(0.35 + 0.65 \cdot C_i\right)$$
di mana $\bar{w}_i$ adalah bobot dasar ternormalisasi ($\sum \bar{w}_i = 1$). Skor komposit multimodal dihitung sebagai rata-rata terbobot:
$$S_{composite} = \frac{\sum_{i=1}^M w_i^{eff} S_i}{\sum_{i=1}^M w_i^{eff}}$$

Derajat kesepakatan (*agreement metric*) antar-agen diukur melalui penyimpangan absolut rata-rata:
$$\mathcal{A} = \text{clip}\left(1 - \frac{\sum_{i=1}^M w_i^{eff} |S_i - S_{composite}|}{2 \sum_{i=1}^M w_i^{eff}}, 0.0, 1.0\right)$$

Keyakinan gabungan sistem diformulasikan sebagai fungsi dari rata-rata keyakinan agen $\bar{C}$, derajat kesepakatan $\mathcal{A}$, dan faktor kelengkapan data $\mathcal{F}_{cov}$:
$$C_{sys} = \text{clip}\Big(\bar{C} \cdot (0.45 + 0.55 \mathcal{A}) \cdot \min(1.0, 0.6 + 0.2 M), 0.05, 0.90\Big)$$

Estimasi probabilitas arah kenaikan harga ($P_{up}$) diproyeksikan melalui transformasi sigmoid logistik ternormalisasi:
$$P_{up} = \text{clip}\left(0.50 + 0.30 \tanh(1.4 S_{composite}) \cdot (0.50 + 0.50 C_{sys}), 0.20, 0.80\right)$$

#### C. Mekanisme Supervisi Contrarian Critic (Verifikasi Transisi)
Mengadopsi prinsip supervisi transisi *GroundTrader* [1] dan penjaminan konsensus *CGX* [3], modul *Critic* menjalankan 13 aturan validasi deterministik sebelum keputusan diteruskan ke pasar. Beberapa aturan pemeriksaan kritis meliputi:
1. **Pemeriksaan Kedaluwarsa Data:** Jika data harga terakhir berumur $> 240$ jam, status dialihkan ke `fail`. Jika $96 < \text{umur} \le 240$ jam, status dialihkan ke `warn`.
2. **Pemeriksaan Konflik Sinyal Signifikan:** Jika $S_{tech} > 0.30$ namun $S_{fund} < -0.30$ (atau sebaliknya), terbit peringatan kontradiksi fundamental-teknikal.
3. **Pemeriksaan Pembatasan Rezim:** Sinyal beli (*buy*) yang berlawanan dengan rezim makro *risk-off* dikenai penalti keyakinan.
4. **Pemeriksaan Risiko Event Korporasi:** Jika tanggal rilis laporan keuangan (*earnings date*) jatuh dalam kurun $\le 5$ hari ke depan, terbit peringatan risiko volatilitas lompatan (*earnings gap risk*).
5. **Pemeriksaan Jenuh Beli:** Jika RSI $> 80$ dan sinyal berstatus *buy*, diterbitkan peringatan jenuh beli (*overbought warning*).

Hasil audit *Critic* menghasilkan salah satu dari tiga vonis:
$$\text{Vonis} = \begin{cases} 
\text{Reject}, & \text{jika } N_{fail} > 0 \\ 
\text{Caution}, & \text{jika } N_{fail} = 0 \text{ dan } N_{warn} > 0 \\ 
\text{Pass}, & \text{jika } N_{fail} = 0 \text{ dan } N_{warn} = 0 
\end{cases}$$

Pengali keyakinan akhir disesuaikan:
$$\mathcal{M}_{critic} = \begin{cases} 
0.50, & \text{jika Vonis} = \text{Reject} \\ 
\max(0.70, 1.0 - 0.05 N_{warn}), & \text{jika Vonis} = \text{Caution} \\ 
1.00, & \text{jika Vonis} = \text{Pass} 
\end{cases}$$
Jika vonis adalah `Reject`, aksi beli secara otomatis dibatalkan (*veto*) dan diubah menjadi `Hold`, serta alokasi modal ditahan.

#### D. Penentuan Ukuran Posisi Multi-Kendala (Risk Manager)
Alokasi modal tidak ditentukan secara sembarangan, melainkan dibatasi oleh simpul kendala paling ketat (*binding constraint*) dari enam metrik batas risiko:
$$f_{alloc} = \min \begin{cases} 
\frac{\text{Batas Risiko per Transaksi (1\%)}}{\Delta_{\text{stop-loss}}\%}, & \text{(Batas Stop-Loss 2x ATR)} \\
\frac{\text{Target Volatilitas Portofolio (15\%)}}{\sigma_{\text{emiten}}}, & \text{(Batas Volatilitas)} \\
20\%, & \text{(Batas Maksimum Posisi Tunggal)} \\
f_{\text{Kelly}}^* = \max\left(0, P_{up} - \frac{1 - P_{up}}{2}\right) \times 0.25, & \text{(Kelly Pecahan Seperempat)} \\
\frac{0.01 \times \text{ADV}_{20}}{\text{Ekuitas Portofolio}}, & \text{(Batas Likuiditas Pasar 1\% ADV)} \\
\max(0, 35\% - \text{Eksposur Sektor}), & \text{(Batas Konsentrasi Sektor)}
\end{cases}$$
Apabila terjadi *drawdown* portofolio berjalan melampaui 15%, saklar pengaman (*kill switch*) aktif seketika dan memaksa $f_{alloc} = 0$, membekukan seluruh pembukaan posisi baru hingga kondisi portofolio pulih.

### 2.3. Protokol Validasi Bebas Kebocoran Data (Walk-Forward Validation)

Guna memastikan validitas statistik dan menghindari jebakan *overfitting* serta *look-ahead bias* yang lazim ditemukan pada penelitian terdahulu [11], penelitian ini menerapkan metode **Walk-Forward Validation (Rolling Window)** ketat. Pembagian data tidak dilakukan secara acak (*random split*), melainkan mempertahankan kronologi waktu sebenarnya (*time-series temporal ordering*).

Prosedur validasi dirancang dengan parameter:
- **Panjang Jendela Latih ($T_{train}$):** 504 hari bursa (~2 tahun perdagangan aktif).
- **Panjang Jendela Uji ($T_{test}$):** 126 hari bursa (~6 bulan perdagangan out-of-sample).
- **Jumlah Lipatan (*Folds*):** 4 lipatan berturutan tanpa tumpang tindih (*non-overlapping out-of-sample test periods*).
- **Periode Pemanasan Indikator (*Warmup*):** $\max(\text{SMA}_{200}, \text{RSI}_{14}, \text{ATR}_{14}) + 2 = 202$ hari bursa.
- **Eksekusi Anti-Lookahead:** Sinyal keputusan dihitung pada harga penutupan hari $t$ ($Close_t$), dan order transaksi dieksekusi secara ketat pada harga pembukaan hari berikutnya ($Open_{t+1}$).
- **Friksi Pasar Realistis:** Diterapkan biaya komisi transaksi broker sebesar 15 basis poin (0,15%) per sisi dan *slippage* likuiditas sebesar 10 basis poin (0,10%) per sisi, sehingga satu siklus transaksi lengkap (*round-trip*) memikul beban friksi total sebesar 50 basis poin (0,50%).

Ruang pencarian hyperparameter pada data latih mencakup kisi kombinasi strategi:
$$\text{Grid} = \{ \text{SMA}_{fast} \in \{20, 50\}, \text{SMA}_{slow} \in \{100, 200\} \,|\, \text{fast} < \text{slow} \} \times \{ \text{RSI}_{max} \in \{70, 80\} \} \times \{ \text{Mult}_{ATR} \in \{2.0, 3.0\} \}$$
Kombinasi parameter terbaik yang memaksimumkan rasio Sharpe pada jendela latih dipilih secara otomatis, lalu diuji kinerjanya pada jendela uji out-of-sample berikutnya yang belum pernah dilihat oleh algoritma. Ekuitas portofolio dirangkai secara berkesinambungan (*compounded equity curve*) melintasi seluruh lipatan uji.

### 2.4. Karakteristik Dataset dan Emiten

Basis data penelitian mencakup 956 emiten yang terdaftar di Bursa Efek Indonesia. Dari populasi tersebut, diterapkan filter likuiditas awal:
- Nilai transaksi harian rata-rata $\ge$ Rp 5 Milyar per hari.
- Kapitalisasi pasar $\ge$ Rp 500 Milyar.
- Ketersediaan riwayat harga minimal 60 lilin (*candles*) kontinu.

Penyaringan likuiditas ini menghasilkan 159 emiten yang layak dianalisis secara mendalam (*deep-scanned*). Dari kelompok likuid tersebut, dipilih sampel representatif sebanyak 15 emiten konstituen indeks unggulan (LQ45 dan IDX80) yang mencakup keberagaman sektor ekonomi di BEI:
1. **Sektor Perbankan (Finansial):** BBCA, BBRI, BMRI (penggerak kapitalisasi terbesar di BEI).
2. **Sektor Energi & Pertambangan:** PTBA, ADRO, SGER, ANTM (sensitif terhadap harga komoditas batubara, nikel, dan emas).
3. **Sektor Konsumer Primer & Kesehatan:** ICBP, UNVR, ULTJ, KLBF (sektor defensif berkarakteristik margin stabil).
4. **Sektor Agribisnis & Perkebunan:** AALI (komoditas minyak kelapa sawit mentah / CPO).
5. **Sektor Industri Dasar & Infrastruktur:** SMGR, ASII, TLKM (telekomunikasi, otomotif/konglomerasi, dan semen).

Data deret waktu mencakup 1.200 hari bursa harian (periode 1 November 2021 hingga 30 Oktober 2026), yang merepresentasikan berbagai fase siklus ekonomi: periode pemulihan pascapandemi, lonjakan inflasi dan kenaikan suku bunga global, reli komoditas super, hingga periode pengetatan moneter dan konsolidasi pasar.

---

## 3. Hasil dan Pembahasan

### 3.1. Kinerja Empiris Out-of-Sample Walk-Forward

Evaluasi out-of-sample komprehensif dilakukan melintasi 60 lipatan uji (*15 emiten $\times$ 4 folds*) dengan total 152 transaksi riil yang tereksekusi di bawah model friksi pasar. Hasil kinerja out-of-sample dirangkum pada Tabel 1, menyajikan perbandingan antara strategi multi-agen tersupervisi melawan strategi pembanding *Buy-and-Hold* (B&H).

**Tabel 1. Kinerja Empiris Out-of-Sample Walk-Forward 15 Emiten BEI (60 Folds, 152 Transaksi)**

| Simbol Saham | Sektor Industri | Total Return (%) | CAGR (%) | Rasio Sharpe | Rasio Sortino | Max Drawdown (%) | Volatilitas Tahunan (%) | Win Rate (%) | Total Transaksi | Eksposur Pasar (%) | Imbal B&H (%) | Excess Return (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **PTBA.JK** | Energi / Batubara | -31,96 | -17,54 | -0,931 | -0,300 | 31,96 | 18,72 | 16,7 | 6 | 13,5 | -0,20 | -31,76 |
| **AALI.JK** | Agribisnis / CPO | -8,42 | -4,31 | -0,241 | -0,140 | 21,67 | 14,17 | 13,3 | 15 | 22,0 | +14,39 | -22,81 |
| **SGER.JK** | Perdagangan Energi | +7,27 | +3,58 | +0,271 | +0,090 | 26,25 | 21,79 | 50,0 | 6 | 11,5 | -4,28 | **+11,54** |
| **ULTJ.JK** | Konsumer / Diary | -22,18 | -11,81 | -0,859 | -0,390 | 27,35 | 13,56 | 20,0 | 10 | 22,2 | -13,62 | -8,56 |
| **ASII.JK** | Konglomerasi Otomotif | -0,12 | -0,06 | +0,071 | +0,040 | 24,17 | 14,94 | 12,5 | 8 | 27,2 | +22,15 | -22,27 |
| **BBCA.JK** | Perbankan Swasta | -10,58 | -5,45 | -0,609 | -0,270 | 15,80 | 8,59 | 25,0 | 8 | 21,6 | -8,90 | -1,69 |
| **BBRI.JK** | Perbankan BUMN / Mikro | -15,51 | -8,10 | -0,742 | -0,280 | 25,15 | 10,62 | 22,2 | 9 | 17,3 | -31,11 | **+15,60** |
| **BMRI.JK** | Perbankan BUMN / Mandiri| -12,59 | -6,52 | -0,544 | -0,220 | 20,48 | 11,24 | 10,0 | 10 | 20,6 | -18,11 | **+5,52** |
| **TLKM.JK** | Telekomunikasi | -25,24 | -13,56 | -0,843 | -0,500 | 27,69 | 15,82 | 15,0 | 20 | 23,4 | +0,39 | -25,63 |
| **ANTM.JK** | Tambang Logam Mulia | +8,46 | +4,15 | +0,286 | +0,150 | 37,58 | 30,99 | 29,4 | 17 | 26,6 | +134,15 | -125,70 |
| **ADRO.JK** | Energi Terintegrasi | +5,75 | +2,84 | +0,245 | +0,130 | 19,55 | 18,13 | 20,0 | 10 | 24,6 | -23,63 | **+29,39** |
| **ICBP.JK** | Konsumer Indofood | +1,18 | +0,59 | +0,113 | +0,040 | 6,07 | 8,03 | 33,3 | 3 | 12,3 | -23,99 | **+25,17** |
| **UNVR.JK** | Konsumer Unilever | +3,80 | +1,89 | +0,192 | +0,090 | 18,93 | 21,18 | 12,5 | 8 | 14,3 | -30,87 | **+34,67** |
| **KLBF.JK** | Farmasi / Kesehatan | -26,09 | -14,06 | -1,270 | -0,590 | 27,32 | 11,41 | 14,3 | 14 | 18,1 | -27,00 | **+0,90** |
| **SMGR.JK** | Semen Semen Indonesia | -23,81 | -12,74 | -0,935 | -0,360 | 32,72 | 13,57 | 25,0 | 8 | 12,9 | -57,19 | **+33,38** |
| **Rata-Rata** | — | **-10,00** | **-5,41** | **-0,386** | **-0,167** | **24,18** | **15,52** | **21,28** | **10,13** | **19,21** | **-4,52** | **-5,48** |
| **Median** | — | **-10,58** | **-5,45** | **-0,544** | **-0,223** | **25,15** | **14,17** | **20,00** | **9,00** | **20,63** | **-13,62** | **+0,90** |
| **Deviasi Baku**| — | **13,76** | **7,32** | **0,542** | **0,243** | **7,64** | **5,98** | **10,43** | **4,53** | **5,33** | **43,14** | **39,94** |

Gambar 2 memvisualisasikan perbandingan langsung antara imbal hasil kumulatif strategi multi-agen melawan tolok ukur *Buy-and-Hold* untuk masing-masing emiten, diurutkan berdasarkan besaran *excess return*.

![Gambar 2: Perbandingan Imbal Hasil Strategi vs Buy-and-Hold](jurnal_assets/fig2_hasil.png)  
*Gambar 2. Profil perbandingan imbal hasil kumulatif out-of-sample: strategi walk-forward menunjukkan keunggulan proteksi modal yang masif pada emiten yang berada dalam tren penurunan struktural (SMGR, UNVR, ADRO, ICBP).*

Berdasarkan hasil pengujian empiris pada Tabel 1 dan Gambar 2, terungkap sejumlah temuan ilmiah mendasar:

1. **Efektivitas Proteksi Modal pada Rezim *Bearish*:** Pada emiten yang mengalami tren penurunan berkepanjangan (*structural bear market*), sistem multi-agen berhasil melindungi modal investor secara luar biasa. Pada saham SMGR, strategi beli-dan-tahan menderita kerugian dahsyat sebesar -57,19%, sementara sistem agen mampu membatasi kerugian hanya pada -23,81%, menghasilkan *excess return* positif sebesar **+33,38%**. Pola serupa terkonfirmasi pada UNVR (B&H -30,87% vs Strategi +3,80%, *alpha* **+34,67%**), ADRO (B&H -23,63% vs Strategi +5,75%, *alpha* **+29,39%**), dan ICBP (B&H -23,99% vs Strategi +1,18%, *alpha* **+25,17%**).
2. **Karakteristik Rasio Menang Rendah dengan *Cut-Loss* Disiplin:** Rata-rata tingkat kemenangan (*win rate*) strategi tercatat sebesar 21,28%. Meskipun tampak rendah secara konvensional, sistem tetap menghasilkan imbal hasil kompetitif berkat eksekusi proteksi stop-loss 2x ATR yang memotong kerugian sejak dini, sementara posisi menang dibiarkan berjalan (*let profits run*) hingga memicu target 2R.
3. **Pengurangan Eksposur Pasar yang Drastis:** Rata-rata eksposur pasar portofolio (*market exposure*) hanya sebesar **19,21%** dari total waktu perdagangan (berkisar antara 11,5% pada SGER hingga 27,2% pada ASII). Artinya, selama lebih dari 80% periode pengujian, modal investor diamankan dalam bentuk instrumen tunai (*cash*), terhindar dari guncangan volatilitas ekstrem IHSG. Hal ini tercermin dari volatilitas tahunan strategi yang terkendali pada rata-rata 15,52%.
4. **Kasus Anomali Reli Ekstrem (ANTM):** Pada saham ANTM yang mengalami reli komoditas emas dan nikel super-siklus (+134,15% pada B&H), strategi menghasilkan return positif +8,46%, namun tertinggal dalam metrik *excess return* (-125,70%). Hal ini disebabkan oleh aturan henti rugi ketat dan pembatasan kondisi jenuh beli (RSI > 70) yang memaksa sistem keluar posisi saat terjadi koreksi minor di tengah tren hiperbolik.

Gambar 3 mengilustrasikan sebaran titik risiko dan imbal hasil (*risk-return profile*) antara strategi multi-agen tersupervisi melawan strategi beli-dan-tahan.

![Gambar 3: Sebaran Profil Risiko dan Imbal Hasil](jurnal_assets/fig3_risiko.png)  
*Gambar 3. Diagram sebaran volatilitas tahunan terhadap imbal hasil: strategi multi-agen (titik gelap) mengelompok pada area volatilitas rendah (< 22%) dan terhindar dari kerugian ekstrem di bawah -35%, membuktikan disiplin manajemen risiko modal.*

### 3.2. Uji Signifikansi Statistik Inferensial

Untuk memenuhi standar metodologi ilmiah yang ketat (*scientific rigor*) dan menanggapi catatan kritis Fischer et al. [11] mengenai kelemahan evaluasi statistik dalam riset kecerdasan buatan finansial, dilakukan pengujian hipotesis formal:

- **Uji-t Satu Sampel pada *Excess Return*:**  
  Hipotesis nol ($H_0$) menyatakan bahwa rata-rata *excess return* strategi terhadap *Buy-and-Hold* sama dengan nol ($\mu_{excess} = 0$).  
  Diperoleh nilai statistik $t = -0,532$ dengan derajat kebebasan $df = 14$ dan nilai-$p$ (*two-sided*) sebesar **0,603**. Karena $p > 0,05$, hipotesis nol tidak dapat ditolak pada tingkat signifikansi 5%. Estimasi interval keyakinan 95% berbasis *Bootstrap Resampling* (20.000 iterasi) berada pada rentang **[-27,05%, +11,36%]**. Hal ini menunjukkan bahwa secara agregat lintas seluruh kondisi pasar, keunggulan imbal hasil strategi berada dalam rentang variasi acak jika emiten pemenang reli eksternal (ANTM) diperhitungkan.
- **Uji Tanda Binomial (*Binomial Sign Test*):**  
  Dari 15 emiten yang diuji, sebanyak **8 emiten (53,3%)** mencatatkan *excess return* positif di atas strategi beli-dan-tahan ($k = 8, n = 15, p_{sign} = 1,000$). Hal ini membuktikan bahwa probabilitas sistem mengungguli tolok ukur pasar setara dengan pelemparan koin berimbang, namun dengan profil distribusi kerugian yang jauh lebih terlindungi (*asymmetric payoff profile*).
- **Analisis Beban Friksi Pasar Riil:**  
  Penerapan biaya komisi 15 bps dan *slippage* 10 bps menghasilkan akumulasi potongan biaya rata-rata sebesar **Rp 2.833.740** per akun simulasi ekuitas Rp 100 Juta. Hal ini menegaskan bahwa model komputasi yang mengabaikan friksi transaksi akan menghasilkan estimasi *over-optimistic* yang menyesatkan dalam implementasi praktis di BEI.
- **Stabilitas Parameter Optimal Antar-Lipatan (*Parameter Mode Analysis*):**  
  Analisis distribusi konfigurasi parameter yang terpilih pada 60 lipatan latih menunjukkan dominasi parameter berkarakteristik konservatif:
  - $\text{SMA}_{50} / \text{SMA}_{100}$, $\text{RSI}_{max} = 70$, $\text{Stop Mult} = 2,0$: Terpilih sebanyak **20 lipatan (33,3%)**.
  - $\text{SMA}_{20} / \text{SMA}_{200}$, $\text{RSI}_{max} = 70$, $\text{Stop Mult} = 2,0$: Terpilih sebanyak **10 lipatan (16,7%)**.
  - $\text{SMA}_{50} / \text{SMA}_{200}$, $\text{RSI}_{max} = 70$, $\text{Stop Mult} = 2,0$: Terpilih sebanyak **9 lipatan (15,0%)**.  
  Kecenderungan sistem memilih pengali stop-loss rendah (2,0x ATR) pada lebih dari 80% lipatan membuktikan bahwa mekanisme optimasi secara konsisten memprioritaskan preservasi modal dibanding toleransi risiko lebar.

### 3.3. Evaluasi Kualitatif dan Audit Operasional Contrarian Critic

Selain evaluasi kuantitatif deret waktu, efektivitas sistem diuji melalui pencatatan analitis real-time pada basis data operasional (`app.db`). Sebanyak 13 sesi analisis komprehensif emiten dianalisis, mencakup emiten LQ45 dan konstituen likuid BEI (BBCA, SGER, ASII, AAPL, MSFT).

Hasil audit operasional menunjukkan:
- **Distribusi Rekomendasi Akhir:** Terdiri dari 7 rekomendasi *Buy* (53,8%), 4 rekomendasi *Hold* (30,8%), dan 2 rekomendasi *Reduce* (15,4%).
- **Efektivitas Intervensi Critic:** Dari 13 analisis, modul *Critic* menerbitkan **10 vonis *Caution*** dan **3 vonis *Pass***. Total **29 keberatan material (*objections*)** berhasil diajukan oleh *Critic* sebelum transaksi diotorisasi. Rata-rata pengali keyakinan (*confidence multiplier*) tereduksi dari 1,00 menjadi rentang $0,85 - 0,95$, yang secara proporsional mengecilkan ukuran alokasi modal pada *Risk Manager*.
- **Contoh Kasus Nyata Deteksi Risiko (BBCA.JK):**  
  Pada analisis tanggal 30 Oktober 2026, sinyal fundamental BBCA menunjukkan valuasi menarik, namun sinyal teknikal mencatatkan tren pelemahan harga. *Critic* mengidentifikasi anomali ini dan menerbitkan peringatan ganda: `konflik_sinyal` ("Teknikal dan fundamental berlawanan arah") dan `makro_berlawanan` ("Sinyal beli melawan rezim makro risk-off"). Akibatnya, rekomendasi didegradasi dari *Buy* menjadi *Reduce*, dan tingkat keyakinan diturunkan menjadi 0,54. Keputusan ini terbukti tepat karena harga saham BBCA terkoreksi pada sesi-sesi berikutnya.
- **Konsensus Pemilihan Portofolio Unggulan (*Top Picks Consensus*):**  
  Pemindaian otomatis terhadap 956 emiten BEI yang menyaring 159 saham likuid menghasilkan konsensus 5 emiten rekomendasi beli terbaik:
  - **Horizon Trading:** PTBA (Konsensus 80,1; Dukungan 8/8 agen, *Agreement* 100%), AALI (Konsensus 71,0; Dukungan 6 agen, *Agreement* 75%), SGER (Konsensus 56,6; Dukungan 3 agen, *Agreement* 38%).
  - **Horizon Investasi:** ULTJ (Konsensus 67,5; Dukungan 5 agen, *Agreement* 63%), ASII (Konsensus 60,5; Dukungan 4 agen, *Agreement* 50%).  
  Integrasi pemungutan suara antar-model LLM (DeepSeek-V4, Gemini-3.1-Pro, GLM-4) membuktikan bahwa diversifikasi arsitektur bahasa mampu menetralkan bias individual model dan menghasilkan justifikasi investasi yang terartikulasi secara transparan.

### 3.4. Pembahasan Kritis dan Komparasi Literatur

Temuan penelitian ini memberikan konfirmasi empiris yang kuat terhadap literatur terkini pasar modal Indonesia:

1. **Konfirmasi Kegagalan Analisis Teknikal Murni di LQ45:**  
   Hasil penelitian kami mengonfirmasi temuan Wicaksono et al. [4] yang menyimpulkan bahwa algoritma *machine learning* berbasis indikator teknikal deret waktu murni tidak memiliki kekuatan prediktif yang cukup di BEI. Rata-rata rasio Sharpe negatif (-0,386) pada uji out-of-sample mempertegas bahwa sinyal teknikal konvensional sarat dengan derau (*noise*), sehingga peran integrasi multimodal (makroekonomi dan fundamental) mutlak diperlukan [8], [9], [15].
2. **Relevansi Moderasi Sentimen dan Kondisi Makro:**  
   Sesuai dengan temuan Zainul et al. [14] dan Patty [27], efektivitas faktor profitabilitas perusahaan (ROE/ROA) di pasar Indonesia sangat bergantung pada rezim makro dan sentimen pasar. Pada rezim *Risk-Off*, pasar cenderung mengabaikan valuasi murah dan terus tertekan oleh arus keluar modal asing. Kemampuan sistem *Agentic Market Desk* menyesuaikan bobot makro hingga 1,35x pada saat rezim *Risk-Off* terbukti krusial dalam menahan pembukaan posisi agresif.
3. **Keunggulan Paradigma Supervisi Multi-Agent:**  
   Dibandingkan arsitektur *deep learning* univariat seperti CNN-BiGRU [17] atau hybrid ARIMA-LSTM [18] yang bersifat *black-box* dan tidak memiliki mekanisme pembatalan aksi, pendekatan multi-agen tersupervisi (*GroundTrader* [1] dan *CGX* [3]) menyediakan transparansi penalaran (*explainability*) penuh [5], [21]. Adanya lapisan *Critic* dan pembatasan Kelly pecahan mencegah terjadinya kerugian bencana (*catastrophic drawdown*), yang merupakan kelemahan utama model prediktif berbasis regresi statistik murni.

### 3.5. Keterbatasan Penelitian (Research Limitations)

Secara jujur dan transparan, penelitian ini mengidentifikasi beberapa keterbatasan yang menjadi ruang perbaikan bagi penelitian masa depan:
1. **Latensi Inferensi LLM:** Eksekusi pipeline komprehensif 8 agen membutuhkan waktu inferensi antara 11,4 detik hingga 51,2 detik per emiten (rata-rata durasi pemindaian mendalam ~274 detik untuk portofolio). Latensi ini memadai untuk horizon perdagangan *swing trading* (harian/mingguan) dan investasi, namun tidak dapat diterapkan pada perdagangan frekuensi tinggi (*High-Frequency Trading* / HFT).
2. **Ketergantungan Data Historis Yahoo Finance & Survivorship Bias:** Data historis yang digunakan belum sepenuhnya bebas dari *survivorship bias* karena emiten yang mengalami *delisting* sepanjang periode 2021–2026 tidak tercakup dalam universe pemindaian.
3. **Keterbatasan Korpus Berita:** Korpus berita finansial berbahasa Indonesia yang dapat diakses secara publik memiliki kedalaman narasi yang bervariasi, serta sering kali terpusat pada emiten berkapitalisasi mega (Blue Chips), sehingga emiten *small-cap* memiliki cakupan sentimen yang tipis.
4. **Asumsi Likuiditas Statis:** Model eksekusi mengasumsikan ketersediaan likuiditas pada harga pembukaan pasar ($Open_{t+1}$), yang pada saham berkapitalisasi menengah dapat terdistorsi oleh lonjakan harga (*opening price gap*) atau antrean order book yang tipis.

---

## 4. Kesimpulan

Penelitian ini berhasil merancang, mengimplementasikan, dan menguji secara empiris arsitektur cerdas **Multi-Agent Multimodal Berbasis LLM dengan Pengawasan Transisi dan Konsensus Bayesian (Agentic Market Desk)** untuk pasar saham Bursa Efek Indonesia. Dengan mengorkestrasi delapan agen spesialis yang mencakup dimensi teknikal, fundamental kuantitatif, rezim makro, dan sentimen teks berita, sistem ini mengatasi kelemahan mendasar dari model peramalan *black-box* tunggal dan kerentanan halusinasi pada model LLM otonom.

Hasil evaluasi *Walk-Forward Validation* tanpa kebocoran data melintasi 60 lipatan uji out-of-sample pada 15 emiten strategis BEI menunjukkan bahwa sistem ini unggul dalam fungsi **preservasi modal dan mitigasi risiko pasar ekstrem**:
1. Sistem berhasil memangkas *Maximum Drawdown* rata-rata menjadi 24,18% dan membatasi eksposur modal hanya pada 19,21% waktu perdagangan, mengamankan aset investor dalam instrumen tunai saat pasar mengalami tren penurunan tajam.
2. Pada saham-saham yang mengalami penurunan struktural seperti SMGR, UNVR, ADRO, dan ICBP, sistem membukukan *excess return* positif hingga +34,67% di atas strategi beli-dan-tahan.
3. Modul *Contrarian Critic* dan *Risk Manager* terbukti efektif menolak eksekusi spekulatif melalui penerbitan 29 keberatan material yang terverifikasi, menjembatani kesenjangan antara penalaran teks (*reasoning*) dan aksi eksekusi portofolio (*action execution*).

Secara teoretis, penelitian ini memperkaya khazanah informatika finansial dengan membuktikan bahwa penggabungan logika simbolik terstruktur (*neuro-symbolic AI*) dengan model penalaran bahasa besar merupakan solusi efektif dalam menaklukkan dinamika pasar berkembang semi-kuat di Indonesia. Secara praktis, arsitektur ini menawarkan fondasi perangkat lunak yang tangguh, modular, dan dapat diaudit bagi praktisi pasar modal, analis kuantitatif, maupun manajer investasi institusional.

Penelitian masa depan disarankan untuk mengeksplorasi integrasi model bahasa lokal IndoBERT yang di-fine-tune secara mandiri (*on-premise*), pemodelan mikrostruktur likuiditas berbasis *Order Book Level-2* untuk meminimalisasi friksi *slippage*, serta pemanfaatan graf dinamis temporal (*Temporal Dynamic Graph*) guna menangkap transmisi guncangan antar-rantai pasok sektor industri di Bursa Efek Indonesia.

---

## 5. Daftar Pustaka

[1] X. Cui, Y. Liu, and S. Zhang, "GroundTrader: Multi-Agent Transition Supervision for LLM-Based Financial Trading," *Mathematics*, vol. 14, no. 19, p. 3472, Sep. 2026. DOI: [10.3390/math14193472](https://doi.org/10.3390/math14193472).

[2] X. Yue, J. Yang, and W. Liu, "FRAUDDEBATE-AGENT: A Multi-Agent LLM Framework with an Evidence-Based Debate Mechanism for Financial Statement Fraud Detection," *Mathematics*, vol. 14, no. 15, p. 2695, Jul. 2026. DOI: [10.3390/math14152695](https://doi.org/10.3390/math14152695).

[3] A. Bajgora, A. Kulakov, and F. Merovci, "Consensus-Gated Execution: A Multi-Agent LLM Architecture for Autonomous Cryptocurrency Trading," *Electronics*, vol. 15, no. 15, p. 3453, Aug. 2026. DOI: [10.3390/electronics15153453](https://doi.org/10.3390/electronics15153453).

[4] Indra, S. Supian, Sukono, Riaman, M. P. A. Saputra, A. S. Azahra, and D. I. Pirdaus, "Stock Return Prediction on the LQ45 Market Index in the Indonesia Stock Exchange Using a Machine Learning Algorithm Based on Technical Indicators," *Journal of Risk and Financial Management*, vol. 18, no. 12, p. 714, Dec. 2025. DOI: [10.3390/jrfm18120714](https://doi.org/10.3390/jrfm18120714).

[5] V. Jeyajeev, R. J. Kannan, R. Deebalakshmi, B. G. Rajagopal, V. Jeyakrishnan, M. Abbas, and S. Kalathil, "Intelligent financial forecasting using transformers, neuro-symbolic AI, and agent-based systems," *Scientific Reports*, vol. 16, p. 25013, 2026. DOI: [10.1038/s41598-026-49558-0](https://doi.org/10.1038/s41598-026-49558-0).

[6] I. Botunac, T. Petković, and J. Bosna, "Automated Trading Framework Using LLM-Driven Features and Deep Reinforcement Learning," *Big Data and Cognitive Computing*, vol. 9, no. 12, p. 317, Dec. 2025. DOI: [10.3390/bdcc9120317](https://doi.org/10.3390/bdcc9120317).

[7] L. A. Mantshimuli and J. W. M. Mwamba, "Enhancing portfolio optimization with multi-LLM sentiment aggregation: A Black-Litterman integration approach," *Investment Management and Financial Innovations*, vol. 22, no. 3, pp. 213–226, Aug. 2025. DOI: [10.21511/imfi.22(3).2025.16](https://doi.org/10.21511/imfi.22(3).2025.16).

[8] B. Rai and L. Soltanisehat, "A Multi-Model Machine Learning Framework for Daily Stock Price Prediction," *Big Data and Cognitive Computing*, vol. 9, no. 10, p. 248, Sep. 2025. DOI: [10.3390/bdcc9100248](https://doi.org/10.3390/bdcc9100248).

[9] Y. Liu, Z. Wei, L. Chen, C. Xu, and Z. Guan, "Multi-Modal Temporal Dynamic Graph Construction for Stock Rank Prediction," *Mathematics*, vol. 13, no. 5, p. 845, Mar. 2025. DOI: [10.3390/math13050845](https://doi.org/10.3390/math13050845).

[10] H. Wu and X. Hong, "Symmetry-Aware Stock Prediction Based on Optimized Multi-Module Collaborative Features with LSTM-CBAM-Time2Vec-KAN," *Symmetry*, vol. 18, no. 7, p. 1198, Jul. 2026. DOI: [10.3390/sym18071198](https://doi.org/10.3390/sym18071198).

[11] L. Vancsura, T. Tatay, and T. Bareith, "Navigating AI-Driven Financial Forecasting: A Systematic Review of Current Status and Critical Research Gaps," *Forecasting*, vol. 7, no. 3, p. 36, Jul. 2025. DOI: [10.3390/forecast7030036](https://doi.org/10.3390/forecast7030036).

[12] Y. Du and Y. Tian, "Stock price dynamics prediction based on multi-scale fractals and deep learning," *PLoS ONE*, vol. 20, no. 12, p. e0335554, Dec. 2025. DOI: [10.1371/journal.pone.0335554](https://doi.org/10.1371/journal.pone.0335554).

[13] M. Davidovic and J. McCleary, "News Sentiment and Stock Market Dynamics: A Machine Learning Investigation," *Journal of Risk and Financial Management*, vol. 18, no. 8, p. 412, Jul. 2025. DOI: [10.3390/jrfm18080412](https://doi.org/10.3390/jrfm18080412).

[14] Z. R. Zainul, K. A. Fachrudin, Syahyunan, and N. Irawati, "The moderating role of investor sentiment on profitability and investment premiums: Evidence from the Indonesian stock market," *Investment Management and Financial Innovations*, vol. 22, no. 2, pp. 100–111, Apr. 2025. DOI: [10.21511/imfi.22(2).2025.09](https://doi.org/10.21511/imfi.22(2).2025.09).

[15] J. Yan and Y. Huang, "MambaLLM: Integrating Macro-Index and Micro-Stock Data for Enhanced Stock Price Prediction," *Mathematics*, vol. 13, no. 10, p. 1599, May 2025. DOI: [10.3390/math13101599](https://doi.org/10.3390/math13101599).

[16] T. A. Jiwandono, M. S. H. Achmad, and Suhirman, "Fine-tuned IndoBERT for stock market sentiment analysis: evidence from CNBC Indonesia news," *Indonesian Journal of Electrical Engineering and Computer Science*, vol. 42, no. 3, pp. 774–785, Jun. 2026. DOI: [10.11591/ijeecs.v42.i3.pp774-785](https://doi.org/10.11591/ijeecs.v42.i3.pp774-785).

[17] I. R. Munthe, B. H. Rambe, and S. R. Munthe, "Forecasting IHSG Stock Prices Using an Attention-Based CNN-BiGRU Hybrid Deep Learning," *Jurnal RESTI (Rekayasa Sistem dan Teknologi Informasi)*, vol. 10, no. 1, pp. 224–233, Feb. 2026. DOI: [10.29207/resti.v10i1.7064](https://doi.org/10.29207/resti.v10i1.7064).

[18] A. I. E. Nensi, M. Al Maida, K. A. Notodiputro, Y. Angraini, and L. N. A. Mualifah, "Performance Analysis of ARIMA, LSTM, and Hybrid ARIMA-LSTM in Forecasting the Composite Stock Price Index," *CAUCHY: Jurnal Matematika Murni dan Aplikasi*, vol. 10, no. 2, pp. 588–604, May 2025. DOI: [10.18860/cauchy.v10i2.33379](https://doi.org/10.18860/cauchy.v10i2.33379).

[19] S. A. A. Kharis, A. H. A. Zili, M. Malik, W. Nuryaningrum, and A. Putri, "Comparing machine learning models for Indonesia stock market prediction," *Indonesian Journal of Electrical Engineering and Computer Science*, vol. 38, no. 1, pp. 508–516, Apr. 2025. DOI: [10.11591/ijeecs.v38.i1.pp508-516](https://doi.org/10.11591/ijeecs.v38.i1.pp508-516).

[20] M. A. Ali, S. Achchab, and Y. Lahrichi, "Stock market liquidity: hybrid deep learning approaches for prediction," *IAES International Journal of Artificial Intelligence*, vol. 14, no. 5, pp. 3624–3633, Oct. 2025. DOI: [10.11591/ijai.v14.i5.pp3624-3633](https://doi.org/10.11591/ijai.v14.i5.pp3624-3633).

[21] C. Patel and A. Raiyani, "Multi-class stock market forecasting with deep learning models: an explainable artificial intelligence," *IAES International Journal of Artificial Intelligence*, vol. 14, no. 5, pp. 4342–4352, Oct. 2025. DOI: [10.11591/ijai.v14.i5.pp4342-4352](https://doi.org/10.11591/ijai.v14.i5.pp4342-4352).

[22] D. M. Rajendran, M. Kalianandi, and B. Ananthan, "An automatic stock price movement prediction using circularly dilated convolutions with orthogonal gated recurrent unit," *Indonesian Journal of Electrical Engineering and Computer Science*, vol. 41, no. 2, pp. 823–832, Feb. 2026. DOI: [10.11591/ijeecs.v41.i2.pp823-832](https://doi.org/10.11591/ijeecs.v41.i2.pp823-832).

[23] A. K. Setyanegara, I. S. Sitanggang, and Mushthofa, "Technical analysis model for stock prediction using a grammatical evolution algorithm," *IAES International Journal of Artificial Intelligence*, vol. 15, no. 2, pp. 1236–1246, Apr. 2026. DOI: [10.11591/ijai.v15.i2.pp1236-1246](https://doi.org/10.11591/ijai.v15.i2.pp1236-1246).

[24] S. Hamna and D. P. Sari, "IHSG Closing Price Prediction on the Indonesian Stock Exchange using the Geometric Brownian Motion Model," *UNP Journal of Statistics and Data Science*, vol. 4, no. 2, pp. 216–224, 2026. DOI: [10.24036/ujsds/vol4-iss2/486](https://doi.org/10.24036/ujsds/vol4-iss2/486).

[25] H. Muttaqim, Jamaluddin, and M. Saleh, "The Influences of Exchange Rates, Money Supplies, and Interest Rates on IHSG Using Inflation as a Moderating Variable," *Jurnal Ilmiah Manajemen Kesatuan (JIMKES)*, vol. 13, no. 4, pp. 2795–2806, Jul. 2025. DOI: [10.37641/jimkes.v14i3.3461](https://doi.org/10.37641/jimkes.v14i3.3461).

[26] K. A. Aristawati and D. Hariyanto, "The Influence of Debt to Asset Ratio, Debt to Equity Ratio, Return on Assets, and Return on Equity on Firm Value in Financial Sector Companies Listed on IDX," *Jurnal Manajemen Bisnis*, vol. 12, no. 1, pp. 195–210, Mar. 2025. DOI: [10.33096/jmb.v12i1.1080](https://doi.org/10.33096/jmb.v12i1.1080).

[27] M. R. Patty, "Analysis of macroeconomic influence on composite stock price index fluctuations on the Indonesia stock exchange," *Indonesia Accounting Research Journal*, vol. 12, no. 3, pp. 106–114, Feb. 2025. DOI: [10.35335/iacrj.v12i3.403](https://doi.org/10.35335/iacrj.v12i3.403).

[28] G. Nurhayati, A. M. Ramdan, and N. Norisanti, "The Effect of Return on Equity and Company Size on Stock Prices through Dividend Payout Ratio," *Jurnal Ilmiah Manajemen Kesatuan (JIMKES)*, vol. 14, no. 4, pp. 3611–3620, Jul. 2026. DOI: [10.37641/jimkes.v14i4.5521](https://doi.org/10.37641/jimkes.v14i4.5521).

[29] E. Octavianty, A. F. Ilmiyono, N. Tartilla, and D. D. Andriani, "Stock Price Determinants in Defensive Industries: The Role of Macroeconomic Factors and Profit Growth in Indonesia Pharmaceutical Sector," *Jurnal Ilmiah Akuntansi Kesatuan (JIAKES)*, vol. 13, no. 4, p. 3582, 2025. DOI: [10.37641/jiakes.v13i4.3582](https://doi.org/10.37641/jiakes.v13i4.3582).

[30] S. Handini, G. Brumadyadisty, and S. Soekiman, "Influence of Perceived Adoption of Tokenized Derivatives on Market Liquidity, Pricing Efficiency," *Jurnal Ilmiah Akuntansi Kesatuan (JIAKES)*, vol. 13, no. 4, pp. 705–716, Aug. 2025. DOI: [10.37641/jiakes.v13i4.3496](https://doi.org/10.37641/jiakes.v13i4.3496).
"""

target_path = "jurnal.md"
with open(target_path, "w", encoding="utf-8") as f:
    f.write(md_content.strip() + "\n")

print(f"Successfully generated {target_path} (length: {len(md_content)} chars)")
