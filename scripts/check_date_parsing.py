#!/usr/bin/env python3
"""Vérifie quelles lignes ont des dates non parsables."""
import openpyxl
import re
from collections import Counter

FILE = "/home/z/my-project/upload/export-1795434544738.xlsx"

wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

# Headers
rows = list(ws.iter_rows(min_row=1, max_row=1, values_only=True))
headers = list(rows[0])
print(f"Headers: {headers}")
date_col_idx = None
for i, h in enumerate(headers):
    if h and "date" in str(h).lower():
        date_col_idx = i
        print(f"Date column: '{h}' at index {i}")
        break

if date_col_idx is None:
    print("No date column found!")
    wb.close()
    exit(1)

# Scan all date values
date_types = Counter()
problem_rows = []
total = 0
for r in ws.iter_rows(min_row=3, values_only=True):
    if r[0] is None or not r[3] or str(r[3]).upper() == 'TOTAL':
        continue
    total += 1
    date_val = r[date_col_idx]
    if date_val is None:
        date_types['None'] += 1
        if len(problem_rows) < 3:
            problem_rows.append(('None', r[0], r[date_col_idx], r[2]))
    elif hasattr(date_val, 'year'):
        date_types['datetime'] += 1
    elif isinstance(date_val, str):
        # Check if parseable DD/MM/YYYY
        m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_val.strip())
        if m:
            date_types['string_DD/MM/YYYY'] += 1
        else:
            date_types['string_other'] += 1
            if len(problem_rows) < 10:
                problem_rows.append(('string_other', r[0], date_val, r[2]))
    elif isinstance(date_val, (int, float)):
        date_types['number'] += 1
        if len(problem_rows) < 10:
            problem_rows.append(('number', r[0], date_val, r[2]))
    else:
        date_types[f'unknown_{type(date_val).__name__}'] += 1
        if len(problem_rows) < 10:
            problem_rows.append((f'unknown_{type(date_val).__name__}', r[0], date_val, r[2]))

wb.close()

print(f"\nTotal data rows: {total}")
print(f"\nDate types:")
for t, c in date_types.most_common():
    print(f"  {t}: {c}")

print(f"\nProblem rows (sample):")
for p in problem_rows:
    print(f"  type={p[0]}, ref={p[1]}, date_val={p[2]!r}, produit={p[3]}")
