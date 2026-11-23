#!/usr/bin/env python3
"""Analyse le nouveau fichier avec dates réelles."""
import openpyxl
from collections import defaultdict
import re

FILE = "/home/z/my-project/upload/export-1795434544738.xlsx"

wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

by_month = defaultdict(lambda: {'lines': 0, 'colis': 0, 'ht': 0, 'bls': set()})
total_ht = 0
total_colis = 0
total_lines = 0
bl_count = defaultdict(int)  # bl -> nb lignes
date_min = None
date_max = None

def parse_date(s):
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', str(s).strip())
    if m:
        return (int(m[3]), int(m[2]), int(m[1]))
    return None

for r in ws.iter_rows(min_row=3, values_only=True):
    ref = r[0]
    date = r[1]
    produit = r[3]
    if ref is None or not produit or str(produit).upper() == 'TOTAL':
        continue
    ht = r[8] if isinstance(r[8], (int, float)) else 0
    colis = r[5] if isinstance(r[5], (int, float)) else 0
    total_ht += ht
    total_colis += colis
    total_lines += 1
    bl_count[str(ref).strip()] += 1

    parsed = parse_date(date)
    if parsed:
        y, m, d = parsed
        key = f"{y}-{m:02d}"
        by_month[key]['lines'] += 1
        by_month[key]['colis'] += colis
        by_month[key]['ht'] += ht
        by_month[key]['bls'].add(str(ref).strip())
        if date_min is None or (y, m, d) < date_min:
            date_min = (y, m, d)
        if date_max is None or (y, m, d) > date_max:
            date_max = (y, m, d)

wb.close()

print(f"Total lignes: {total_lines}")
print(f"Total HT: {total_ht:.2f} €")
print(f"Total colis: {total_colis}")
print(f"BL uniques: {len(bl_count)}")
print(f"Date range: {date_min} → {date_max}")
print(f"\n=== Répartition par mois ===")
for k in sorted(by_month.keys()):
    v = by_month[k]
    print(f"  {k}: {v['lines']:4d} lignes, {v['colis']:6d} colis, {v['ht']:10.2f} €, {len(v['bls'])} BL")

print(f"\n=== Top 5 BL par nb lignes (pour voir structure) ===")
top_bl = sorted(bl_count.items(), key=lambda x: -x[1])[:5]
for ref, n in top_bl:
    print(f"  {ref}: {n} lignes")
