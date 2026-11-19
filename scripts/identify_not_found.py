#!/usr/bin/env python3
"""Identifie les BL NOT_FOUND (non présents dans Sale) du fichier détail."""
import openpyxl
import urllib.request
import json
from collections import defaultdict

FILE = "/home/z/my-project/upload/export-1795100361416.xlsx"

# 1) Extract all BL refs from detail file
wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
refs_in_file = set()
for r in ws.iter_rows(min_row=3, values_only=True):
    ref = r[0]
    if ref is not None and r[2] and r[2] != 'TOTAL':
        refs_in_file.add(str(ref).strip())
wb.close()

# 2) Fetch ALL Sale records for 2025-2026 (all available periods)
all_sale_refs = {}
for y in [2024, 2025, 2026]:
    for m in range(1, 13):
        url = f"https://venteskooks.vercel.app/api/sales?year={y}&month={m}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Python"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.load(resp)
            sales = data.get("sales") or data.get("data") or []
            for s in sales:
                ref = str(s.get("blNumber") or s.get("reference") or s.get("ref") or "").strip()
                if ref:
                    all_sale_refs[ref] = {
                        "date": (s.get("date") or "")[:10],
                        "month": s.get("month"),
                        "year": s.get("year"),
                        "ht": s.get("amountHT") or s.get("ht") or 0,
                    }
        except Exception:
            pass

print(f"Total Sale records fetched: {len(all_sale_refs)}")

# 3) Find NOT_FOUND refs and inspect
not_found = [r for r in refs_in_file if r not in all_sale_refs]
print(f"\nBL dans fichier détail: {len(refs_in_file)}")
print(f"BL trouvés dans Sale: {len(refs_in_file) - len(not_found)}")
print(f"BL NOT_FOUND: {len(not_found)}")

# Group NOT_FOUND refs by sequence range
not_found_nums = []
for r in not_found:
    if r.isdigit():
        not_found_nums.append(int(r))
not_found_nums.sort()
print(f"\nNOT_FOUND BL numéros: min={not_found_nums[0] if not_found_nums else 'N/A'}, max={not_found_nums[-1] if not_found_nums else 'N/A'}")
print(f"Premiers 10: {not_found_nums[:10]}")
print(f"Derniers 10: {not_found_nums[-10:]}")

# Distribution par tranche
buckets = defaultdict(int)
for n in not_found_nums:
    buckets[(n // 100) * 100] += 1
print("\nDistribution NOT_FOUND par tranche de 100:")
for b in sorted(buckets.keys()):
    print(f"  {b:06d}-{b+99:06d}: {buckets[b]} BL")

# Compare with found refs distribution
found_nums = [int(r) for r in refs_in_file if r.isdigit() and r in all_sale_refs]
found_nums.sort()
print(f"\nFound BL: min={found_nums[0]}, max={found_nums[-1]}")
buckets_f = defaultdict(int)
for n in found_nums:
    buckets_f[(n // 100) * 100] += 1
print("Distribution FOUND par tranche de 100:")
for b in sorted(buckets_f.keys()):
    print(f"  {b:06d}-{b+99:06d}: {buckets_f[b]} BL")

# Save NOT_FOUND list for next step
with open("/home/z/my-project/scripts/not_found_refs.json", "w") as f:
    json.dump(not_found, f, indent=2)
print(f"\nSaved {len(not_found)} NOT_FOUND refs to scripts/not_found_refs.json")
