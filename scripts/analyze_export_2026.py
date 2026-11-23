#!/usr/bin/env python3
"""Analyse le fichier détail produits pour identifier les mois couverts."""
import openpyxl
from collections import defaultdict

FILE = "/home/z/my-project/upload/export-1795100361416.xlsx"

wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

rows = list(ws.iter_rows(min_row=2, values_only=True))
wb.close()

# Filter out the TOTAL row and empty rows
data = [r for r in rows if r[0] is not None and r[2] and r[2] != 'TOTAL']

print(f"Total lignes détail: {len(data)}")

# Extract BL refs (col 0) - format like 26000750 or FV-00001
refs = set()
total_ht = 0
total_colis = 0
total_pieces = 0
for r in data:
    ref = str(r[0])
    refs.add(ref)
    # Total HT col index 7
    ht = r[7] if isinstance(r[7], (int, float)) else 0
    colis = r[4] if isinstance(r[4], (int, float)) else 0
    pieces = r[5] if isinstance(r[5], (int, float)) else 0
    total_ht += ht
    total_colis += colis
    total_pieces += pieces

print(f"Total HT calculé: {total_ht:.2f} €")
print(f"Total colis: {total_colis}")
print(f"Total pièces: {total_pieces}")
print(f"Nb BL uniques: {len(refs)}")

# Group refs by prefix to understand structure
# Refs like 26000750 -> first 2 digits = year (26=2026), rest = sequence
prefixes = defaultdict(list)
for ref in refs:
    if ref.isdigit() and len(ref) >= 8:
        year_prefix = ref[:2]
        seq = int(ref[2:])
        prefixes[year_prefix].append(seq)
    else:
        prefixes[ref[:6]].append(0)

print("\nRéférences BL par préfixe:")
for prefix, seqs in sorted(prefixes.items()):
    seqs.sort()
    print(f"  {prefix}xxxxxxx: {len(seqs)} BL, range {seqs[0]}-{seqs[-1]}")

# Check if file has a Date column (it doesn't from headers, only Référence/Client/Produit)
# So we need to infer month from BL sequence number
# Let's bucket refs by sequence ranges and compute HT per bucket
print("\n=== HT par tranche de 100 BL (séquence) ===")
buckets = defaultdict(lambda: {'ht': 0, 'colis': 0, 'nb': 0})
for r in data:
    ref = str(r[0])
    if ref.isdigit() and len(ref) >= 8:
        seq = int(ref[2:])
        bucket = (seq // 100) * 100
        ht = r[7] if isinstance(r[7], (int, float)) else 0
        colis = r[4] if isinstance(r[4], (int, float)) else 0
        buckets[bucket]['ht'] += ht
        buckets[bucket]['colis'] += colis
        buckets[bucket]['nb'] += 1

for bucket in sorted(buckets.keys()):
    b = buckets[bucket]
    print(f"  BL {bucket:06d}-{bucket+99:06d}: {b['nb']:4d} lignes, {b['colis']:6d} colis, {b['ht']:10.2f} €")
