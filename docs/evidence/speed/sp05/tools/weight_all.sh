#!/bin/bash
# weight_all.sh <outdir>: html_weight.py for every page in urls.json against :3180
S=$HOME/.cache/courtlens-tmp/sp05; mkdir -p $1
python3 -c 'import json;[print(p["name"],p["path"]) for p in json.load(open("/home/ethioking/dev/courtlens/scripts/speed/urls.json"))["pages"]]' | while read name path; do
  python3 $S/tools/html_weight.py "http://localhost:3180$path" --top 30 --json $1/$name.json > $1/$name.txt
done
python3 - $1 <<'PY'
import json,sys,glob,os
for f in sorted(glob.glob(sys.argv[1]+"/*.json")):
    d=json.load(open(f)); top=d["props"][:3]
    print(f'{os.path.basename(f)[:-5]:<15} total {d["total"]:>9,}  markup {d["markup"]:>9,}  rsc {d["rsc_scripts"]:>9,}  | ' + "; ".join(f'{p["component"]}.{p["prop"]} {p["bytes"]:,}' for p in top))
PY
