#!/usr/bin/env python3
"""Test comment xlsx (Node) parse les dates avec cellDates: true vs false."""
# On simule ce que fait la route Node: read avec cellDates puis sheet_to_json raw
# Ici on teste avec Python openpyxl pour comprendre la structure des cellules
import openpyxl
from collections import Counter

FILE = "/home/z/my-project/upload/export-1795434544738.xlsx"

# Lecture avec cellules brutes (pas de conversion)
wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

# Vérifie le format des cellules de la colonne date
date_formats = Counter()
sample_cells = []
for i, r in enumerate(ws.iter_rows(min_row=3, max_row=50, values_only=False)):
    cell = r[1]  # colonne date
    if cell.value is not None:
        date_formats[str(type(cell.value).__name__)] += 1
        if len(sample_cells) < 5:
            sample_cells.append({
                'value': cell.value,
                'type': type(cell.value).__name__,
                'number_format': cell.number_format,
                'is_date': cell.is_date,
            })

wb.close()

print("Date cell types (rows 3-50):")
for t, c in date_formats.most_common():
    print(f"  {t}: {c}")

print("\nSample cells:")
for s in sample_cells:
    print(f"  {s}")
