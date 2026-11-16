import json, math, random, statistics as st

d = [r for r in json.load(open("backend/tmp_eval/results.json", encoding="utf-8")) if "error" not in r]
n = len(d)

def col(f):
    return [r["wf"][f] for r in d]

def t_cdf(t, df):
    # two-sided p via regularized incomplete beta
    x = df / (df + t * t)
    def betacf(a, b, x):
        MAXIT, EPS, FPMIN = 200, 3e-12, 1e-300
        qab, qap, qam = a + b, a + 1.0, a - 1.0
        c = 1.0
        dd = 1.0 - qab * x / qap
        if abs(dd) < FPMIN: dd = FPMIN
        dd = 1.0 / dd
        h = dd
        for m in range(1, MAXIT):
            m2 = 2 * m
            aa = m * (b - m) * x / ((qam + m2) * (a + m2))
            dd = 1.0 + aa * dd
            if abs(dd) < FPMIN: dd = FPMIN
            c = 1.0 + aa / c
            if abs(c) < FPMIN: c = FPMIN
            dd = 1.0 / dd
            h *= dd * c
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
            dd = 1.0 + aa * dd
            if abs(dd) < FPMIN: dd = FPMIN
            c = 1.0 + aa / c
            if abs(c) < FPMIN: c = FPMIN
            dd = 1.0 / dd
            de = dd * c
            h *= de
            if abs(de - 1.0) < EPS: break
        return h
    def betai(a, b, x):
        if x <= 0: return 0.0
        if x >= 1: return 1.0
        bt = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1 - x))
        if x < (a + 1) / (a + b + 2):
            return bt * betacf(a, b, x) / a
        return 1.0 - bt * betacf(b, a, 1 - x) / b
    return betai(df / 2.0, 0.5, x)

def one_sample(vals):
    m = st.mean(vals); s = st.stdev(vals); nn = len(vals)
    t = m / (s / math.sqrt(nn))
    p = t_cdf(abs(t), nn - 1)
    return m, s, t, p

random.seed(42)
def boot(vals, B=20000):
    means = []
    for _ in range(B):
        means.append(st.mean([random.choice(vals) for _ in vals]))
    means.sort()
    return means[int(0.025 * B)], means[int(0.975 * B)]

res = {}
for f in ["totalReturnPct","cagrPct","sharpe","sortino","maxDrawdownPct","annualizedVolPct",
          "winRatePct","exposurePct","tradeCount","buyHoldReturnPct","excessReturnPct","calmar"]:
    v = col(f)
    res[f] = dict(mean=st.mean(v), median=st.median(v), sd=st.stdev(v), mn=min(v), mx=max(v))

for key in ["excessReturnPct", "sharpe", "totalReturnPct"]:
    m, s, t, p = one_sample(col(key))
    lo, hi = boot(col(key))
    res[key].update(t=t, p=p, ci_lo=lo, ci_hi=hi)

# binomial sign test for beat-buyhold
k = sum(1 for x in col("excessReturnPct") if x > 0)
p_sign = sum(math.comb(n, i) for i in range(k, n + 1)) / 2 ** n * 2
res["beat_bh"] = dict(k=k, n=n, p_sign=min(1.0, p_sign))

# distribution of selected parameters across folds
from collections import Counter
c = Counter()
for r in d:
    for f in r["selected"]:
        c[(f["params"]["fastSma"], f["params"]["slowSma"], f["params"]["rsiEntryMax"], f["params"]["stopAtrMult"])] += 1
res["param_modes"] = {f"{k[0]}/{k[1]}/rsi{k[2]}/sl{k[3]}": v for k, v in c.most_common()}
res["folds"] = sum(r["folds"] for r in d)
res["trades_total"] = sum(r["wf"]["tradeCount"] for r in d)

# fee burden
res["fees"] = dict(mean=st.mean([r["wf"]["feesPaid"] for r in d]))

print(json.dumps(res, indent=1, ensure_ascii=False))
json.dump(res, open("backend/tmp_eval/summary.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

# per-ticker table rows for the paper
print("\nTICKER | ret | cagr | sharpe | mdd | vol | win | trades | expo | bh | excess")
for r in d:
    a = r["wf"]
    print(f"{r['symbol']:9} {a['totalReturnPct']:7.2f} {a['cagrPct']:7.2f} {a['sharpe']:6.3f} {a['maxDrawdownPct']:6.2f} {a['annualizedVolPct']:6.2f} {a['winRatePct']:5.1f} {a['tradeCount']:3d} {a['exposurePct']:5.1f} {a['buyHoldReturnPct']:8.2f} {a['excessReturnPct']:8.2f}")
