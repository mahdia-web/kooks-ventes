#!/usr/bin/env python3
"""Analyse le fichier ventes-1795508581301.xlsx (BL-level, octobre 2026)
et le compare avec les données en base (Sale + VolumeSale)."""
import openpyxl
import re
from collections import defaultdict, Counter

FILE = "/home/z/my-project/upload/ventes-1795508581301.xlsx"

wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

rows = list(ws.iter_rows(min_row=2, values_only=True))
# Saute la dernière ligne TOTAL
data_rows = [r for r in rows if r[0] is not None and r[3] != 'TOTAL']

print(f"=== Fichier ventes-1795508581301.xlsx ===")
print(f"Total lignes (BL): {len(data_rows)}")

# Colonnes: 0=Ref, 1=Date, 3=Client, 7=Montant HT, 16=Commercial, 17=Secteur
total_ht = sum(r[7] or 0 for r in data_rows)
print(f"Total HT: {total_ht:.2f} €")

# Par date
by_date = defaultdict(lambda: {'nb': 0, 'ht': 0, 'bls': set()})
for r in data_rows:
    ref = str(r[0]).strip()
    date = r[1]
    ht = r[7] or 0
    by_date[str(date)]['nb'] += 1
    by_date[str(date)]['ht'] += ht
    by_date[str(date)]['bls'].add(ref)

print(f"\n=== Répartition par date ===")
for d in sorted(by_date.keys()):
    v = by_date[d]
    print(f"  {d}: {v['nb']:3d} BL, {v['ht']:10.2f} €")

# Par commercial
by_comm = defaultdict(lambda: {'nb': 0, 'ht': 0})
for r in data_rows:
    comm = r[16] or '(vide)'
    by_comm[str(comm)]['nb'] += 1
    by_comm[str(comm)]['ht'] += r[7] or 0

print(f"\n=== Par commercial ===")
for c, v in sorted(by_comm.items(), key=lambda x: -x[1]['ht']):
    print(f"  {c}: {v['nb']:3d} BL, {v['ht']:10.2f} €")

# Par secteur
by_sect = defaultdict(lambda: {'nb': 0, 'ht': 0})
for r in data_rows:
    sect = r[17] or '(vide)'
    by_sect[str(sect)]['nb'] += 1
    by_sect[str(sect)]['ht'] += r[7] or 0

print(f"\n=== Par secteur ===")
for s, v in sorted(by_sect.items(), key=lambda x: -x[1]['ht']):
    print(f"  {s}: {v['nb']:3d} BL, {v['ht']:10.2f} €")

# Top 20 clients
by_client = defaultdict(lambda: {'nb': 0, 'ht': 0, 'bls': set()})
for r in data_rows:
    client = str(r[3] or '').strip()
    by_client[client]['nb'] += 1
    by_client[client]['ht'] += r[7] or 0
    by_client[client]['bls'].add(str(r[0]).strip())

print(f"\n=== Top 20 clients par CA ===")
for c, v in sorted(by_client.items(), key=lambda x: -x[1]['ht'])[:20]:
    print(f"  {c[:55]:55s} | {v['nb']:3d} BL | {v['ht']:10.2f} €")

# Vérifier les avoirs (HT négatif)
avoirs = [r for r in data_rows if (r[7] or 0) < 0]
print(f"\n=== Avoirs (HT < 0) ===")
print(f"  Nombre: {len(avoirs)}")
for r in avoirs[:10]:
    print(f"  {r[0]} | {r[1]} | {r[3][:40]:40s} | {r[7]:.2f} €")

# Vérifier les BL avec FV- (factures)
fv_rows = [r for r in data_rows if r[19] and 'FV-' in str(r[19])]
print(f"\n=== BL liés à une facture FV- ===")
print(f"  Nombre: {len(fv_rows)}, HT total: {sum(r[7] or 0 for r in fv_rows):.2f} €")

wb.close()
