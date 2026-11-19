#!/usr/bin/env python3
"""Croise les BL du fichier détail avec les dates de la table Sale (via API)."""
import openpyxl
import urllib.request
import json
from collections import defaultdict

FILE = "/home/z/my-project/upload/export-1795100361416.xlsx"

# 1) Extract unique BL refs + per-ref HT from detail file
wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
refs_in_file = set()
ht_per_ref = defaultdict(float)
for r in ws.iter_rows(min_row=3, values_only=True):
    ref = r[0]
    ht = r[7] if isinstance(r[7], (int, float)) else 0
    if ref is not None and r[2] and r[2] != 'TOTAL':
        ref_str = str(ref).strip()
        refs_in_file.add(ref_str)
        ht_per_ref[ref_str] += ht
wb.close()

print(f"BL uniques dans fichier détail: {len(refs_in_file)}")
print(f"HT total fichier: {sum(ht_per_ref.values()):.2f} €")

# 2) Fetch Sale records for 2026 months via API
# Try multiple months from 2026-01 to 2026-11
months_by_ref = {}   # ref -> (date, month)
ht_sale_by_ref = {}

for m in range(1, 12):
    url = f"https://venteskooks.vercel.app/api/sales?year=2026&month={m}&cb={m}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Python"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        sales = data.get("sales") or data.get("data") or []
        for s in sales:
            ref = str(s.get("blNumber") or s.get("reference") or s.get("ref") or "").strip()
            if ref:
                months_by_ref[ref] = (s.get("date", "")[:10], m)
                ht_sale_by_ref[ref] = s.get("amountHT") or s.get("ht") or 0
        print(f"  2026-{m:02d}: {len(sales)} sales")
    except Exception as e:
        print(f"  2026-{m:02d}: ERR {e}")

print(f"\nTotal Sale records fetched: {len(months_by_ref)}")

# 3) Cross-reference: for each BL in detail file, find its month
ref_to_month = defaultdict(lambda: {"count": 0, "ht_detail": 0.0, "ht_sale": 0.0, "dates": set()})
for ref in refs_in_file:
    if ref in months_by_ref:
        date, m = months_by_ref[ref]
        ref_to_month[m]["count"] += 1
        ref_to_month[m]["ht_detail"] += ht_per_ref[ref]
        ref_to_month[m]["ht_sale"] += ht_sale_by_ref.get(ref, 0)
        ref_to_month[m]["dates"].add(date)
    else:
        ref_to_month["NOT_FOUND"]["count"] += 1
        ref_to_month["NOT_FOUND"]["ht_detail"] += ht_per_ref[ref]

print("\n=== Répartition des BL du fichier détail par mois (selon Sale) ===")
for m in sorted(ref_to_month.keys(), key=lambda x: (x != "NOT_FOUND", x)):
    info = ref_to_month[m]
    dates_sorted = sorted(info["dates"])[:3]
    print(f"  Mois {m}: {info['count']:4d} BL, HT détail={info['ht_detail']:10.2f} €, HT Sale={info['ht_sale']:10.2f} €, dates ex: {dates_sorted}")
