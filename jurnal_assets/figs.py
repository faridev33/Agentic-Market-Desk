import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.font_manager as fm

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["DejaVu Serif"],
    "font.size": 8,
    "axes.edgecolor": "#333333",
    "axes.linewidth": 0.8,
    "savefig.dpi": 300,
})

d = [r for r in json.load(open("backend/tmp_eval/results.json", encoding="utf-8")) if "error" not in r]

# ---------------- Figure 1: architecture ----------------
fig, ax = plt.subplots(figsize=(7.2, 4.5))
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

def box(x, y, w, h, title, body="", fc="#f2f2f2", ec="#444444", fs=7.4, bold=True):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6,rounding_size=1.2",
                       linewidth=0.9, edgecolor=ec, facecolor=fc)
    ax.add_patch(p)
    if body:
        ax.text(x + w / 2, y + h * 0.66, title, ha="center", va="center",
                fontsize=fs, fontweight="bold" if bold else "normal")
        ax.text(x + w / 2, y + h * 0.30, body, ha="center", va="center", fontsize=fs - 1.2,
                color="#222222", linespacing=1.25)
    else:
        ax.text(x + w / 2, y + h / 2, title, ha="center", va="center", fontsize=fs,
                fontweight="bold" if bold else "normal")

def arrow(x1, y1, x2, y2, style="-|>", ls="-", lw=0.9, color="#333333"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=8,
                                 linewidth=lw, color=color, linestyle=ls,
                                 shrinkA=0, shrinkB=0))

# data layer
box(2, 82, 96, 14, "Lapisan Data",
    "Yahoo Finance: OHLCV harian (3 tahun), fundamental kuartalan, makro pembanding (VIX, kurva imbal, USD/IDR)\n"
    "Berita: Google News RSS, CNBC Indonesia, Kontan (45 hari terakhir, maks. 12 artikel per emiten)", fs=7.2)

# agents
box(2, 55, 22, 18, "Agen Teknikal", "SMA20/50/200, RSI14, MACD,\nATR, Bollinger, OBV, ROC\nskor tren–momentum–volume", fs=7.0)
box(25.5, 55, 22, 18, "Agen Fundamental", "PER, PBV, EV/EBITDA, ROE,\nmargin, DER, pertumbuhan\nskor valuasi–kualitas–growth", fs=7.0)
box(49, 55, 22, 18, "Agen Makro", "VIX, kurva imbal, USD,\nposisi indeks vs SMA\nrezim risk-on/off/netral", fs=7.0)
box(72.5, 55, 25.5, 18, "Agen Sentimen", "Leksikon finansial + LLM,\nbobot recency/impact/relevansi\nagregat skor −1 s.d. +1", fs=7.0)

for cx in (13, 36.5, 60, 85.2):
    arrow(cx, 82, cx, 73.4)
    arrow(cx, 55, cx, 50.4)

# bus sinyal menuju sintesis
ax.plot([13, 85.2], [50, 50], color="#333333", linewidth=0.9)
arrow(24.5, 50, 24.5, 47.6)

# synthesis
box(2, 34, 45, 13, "Sintesis Berbobot (Synthesizer)",
    "bobot per horizon × pengali rezim × keyakinan agen;\nskor komposit, kesepakatan, probabilitas naik", fs=7.2)
box(53, 34, 45, 13, "Critic / Validator",
    "13 jenis pemeriksaan: kesegaran data, volatilitas, konflik sinyal,\nrisiko event, jenuh beli → pass / caution / reject", fs=7.2)
arrow(47.4, 40.5, 52.6, 40.5)

# risk + output
box(22, 15.5, 56, 13, "Risk Manager",
    "stop 2×ATR, target 2R, batas risiko/transaksi, target volatilitas,\nKelly pecahan, likuiditas 1% ADV, batas sektor, kill switch drawdown", fs=7.2)
box(28, 2.5, 44, 9.6, "Keputusan",
    "aksi • horizon • skor • keyakinan • rencana entry/SL/TP • tesis teraudit", fs=7.4)

arrow(75.5, 34, 75.5, 29.2)
arrow(50, 14.9, 50, 12.7)

ax.text(99, 99, "(a) Pipeline analisis satu emiten", ha="right", va="top", fontsize=8.2, fontweight="bold")
plt.tight_layout()
plt.savefig("tmp_eval/fig1_arsitektur.png", bbox_inches="tight", facecolor="white")
plt.close()

# ---------------- Figure 2: return vs buy&hold ----------------
rows = sorted(d, key=lambda r: r["wf"]["excessReturnPct"])
labels = [r["symbol"].replace(".JK", "") for r in rows]
strat = [r["wf"]["totalReturnPct"] for r in rows]
bh = [r["wf"]["buyHoldReturnPct"] for r in rows]

fig, ax = plt.subplots(figsize=(7.2, 4.3))
y = range(len(rows))
h = 0.38
ax.barh([i + h / 2 for i in y], strat, height=h, color="#4a4a4a", label="Strategi (walk-forward)")
ax.barh([i - h / 2 for i in y], bh, height=h, color="#c9c9c9", edgecolor="#555555",
        linewidth=0.5, label="Beli-dan-tahan")
ax.axvline(0, color="#222222", linewidth=0.8)
ax.set_yticks(list(y))
ax.set_yticklabels(labels, fontsize=7.5)
ax.set_xlabel("Imbal hasil kumulatif out-of-sample (%)", fontsize=8)
ax.legend(loc="lower right", frameon=False, fontsize=7.4)
ax.grid(axis="x", linestyle=":", linewidth=0.5, color="#999999", alpha=0.7)
ax.set_axisbelow(True)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)
plt.tight_layout()
plt.savefig("tmp_eval/fig2_hasil.png", bbox_inches="tight", facecolor="white")
plt.close()

# ---------------- Figure 3: risk-return scatter ----------------
fig, ax = plt.subplots(figsize=(3.6, 3.0))
ax.scatter([r["wf"]["annualizedVolPct"] for r in d], [r["wf"]["totalReturnPct"] for r in d],
           s=26, facecolor="#4a4a4a", edgecolor="white", linewidth=0.5, label="Strategi")
ax.scatter([r["wf"]["annualizedVolPct"] for r in d], [r["wf"]["buyHoldReturnPct"] for r in d],
           s=22, facecolor="none", edgecolor="#777777", linewidth=0.8, marker="^", label="Beli-dan-tahan")
ax.axhline(0, color="#222222", linewidth=0.7)
ax.set_xlabel("Volatilitas tahunan (%)", fontsize=7.5)
ax.set_ylabel("Imbal hasil kumulatif (%)", fontsize=7.5)
ax.set_ylim(-70, 145)
ax.legend(frameon=False, fontsize=6.8, loc="upper left")
ax.grid(linestyle=":", linewidth=0.5, color="#aaaaaa", alpha=0.7)
ax.set_axisbelow(True)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)
plt.tight_layout()
plt.savefig("tmp_eval/fig3_risiko.png", bbox_inches="tight", facecolor="white")
plt.close()

print("figures written")
