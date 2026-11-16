import json
import os

backend_eval = "backend/tmp_eval"
with open(os.path.join(backend_eval, "summary.json"), encoding="utf-8") as f:
    summary = json.load(f)
with open(os.path.join(backend_eval, "results.json"), encoding="utf-8") as f:
    results = [r for r in json.load(f) if "error" not in r]

# Load top picks
with open("backend/data/top-picks.json", encoding="utf-8") as f:
    top_picks = json.load(f)

print(f"Loaded {len(results)} backtest results and top picks.")
