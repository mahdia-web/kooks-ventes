#!/usr/bin/env python3
"""Compare BL par BL: fichier ventes-1795508581301.xlsx vs base Sale.
Génère la liste des BL du fichier (ref, date, client, ht, commercial)."""
import openpyxl
import json
from collections import defaultdict

FILE = "/home/z/my-project/upload/ventes-1795508581301.xlsx"

wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

rows = list(ws.iter_rows(min_row=2, values_only=True))
data_rows = [r for r in rows if r[0] is not None and r[3] != 'TOTAL']

bls = []
for r in data_rows:
    ref = str(r[0]).strip()
    date = str(r[1]).strip() if r[1] else None
    client = str(r[3] or '').strip()
    ht = float(r[7] or 0)
    comm = str(r[16] or '').strip() or 'KOOK\'S'
    bls.append({'ref': ref, 'date': date, 'client': client, 'ht': ht, 'commercial': comm})

wb.close()

# Sauvegarde pour comparaison
with open('/home/z/my-project/scripts/ventes_file_bls.json', 'w') as f:
    json.dump(bls, f, ensure_ascii=False, indent=2)

print(f"Total BL fichier: {len(bls)}")
print(f"Total HT: {sum(b['ht'] for b in bls):.2f} €")
print(f"BL uniques (par ref): {len(set(b['ref'] for b in bls))}")

# Détecte doublons de ref
ref_count = defaultdict(int)
for b in bls:
    ref_count[b['ref']] += 1
dupes = {r: c for r, c in ref_count.items() if c > 1}
if dupes:
    print(f"\n=== Doublons de ref ({len(dupes)}) ===")
    for r, c in list(dupes.items())[:10]:
        print(f"  {r}: {c} occurrences")

# HT par commercial (regroupé KOOK'S pour vide)
by_comm = defaultdict(lambda: {'nb': 0, 'ht': 0, 'bls': set()})
for b in bls:
    comm = b['commercial'] if b['commercial'] else "KOOK'S"
    by_comm[comm]['nb'] += 1
    by_comm[comm]['ht'] += b['ht']
    by_comm[comm]['bls'].add(b['ref'])

print(f"\n=== HT par commercial (vide=KOOK'S) ===")
for c, v in sorted(by_comm.items(), key=lambda x: -x[1]['ht']):
    print(f"  {c}: {v['nb']:3d} BL, {v['ht']:10.2f} € ({len(v['bls'])} BL uniques)")
