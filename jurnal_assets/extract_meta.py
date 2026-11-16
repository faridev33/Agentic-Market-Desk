import glob, os, re, json
from pypdf import PdfReader

base = r"C:\Users\ghiff\OneDrive\Dokumen\Kuliah-Fari\Research Method and Scientific Writing\Jurnal AI Agnet"
files = sorted(glob.glob(os.path.join(base, "*.pdf")))

out = []
for f in files:
    try:
        r = PdfReader(f)
        txt = ""
        for i in range(min(2, len(r.pages))):
            txt += (r.pages[i].extract_text() or "") + "\n"
        txt = re.sub(r"[ \t]+", " ", txt)
        lines = [l.strip() for l in txt.splitlines() if l.strip()]
        citation = [l for l in lines if re.search(r"Citation|citation|doi\.org|DOI:|Vol\.|Volume|pp\.|No\.", l)]
        head = " | ".join(lines[:28])
        out.append({"file": os.path.basename(f), "head": head[:1500], "cite": citation[:6]})
    except Exception as e:
        out.append({"file": os.path.basename(f), "error": str(e)})

with open("C:/Users/ghiff/OneDrive/Dokumen/jquery/Agent/tmp_eval/meta.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)

for i, o in enumerate(out, 1):
    print(f"--- {i:02d} {o['file'][:70]}")
    if "error" in o:
        print("ERR", o["error"]); continue
    print(o["head"][:900])
    for c in o["cite"]:
        print("CITE:", c[:300])
    print()
