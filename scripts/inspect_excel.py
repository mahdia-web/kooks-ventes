import openpyxl
from openpyxl import load_workbook
# Untrusted file: read-only, no eval
wb = load_workbook('/home/z/my-project/upload/Analyse Factures Clients (1).xlsx', read_only=True, data_only=True)
print("Feuilles:", wb.sheetnames)
for sn in wb.sheetnames[:3]:
    ws = wb[sn]
    print(f"\n=== Feuille: {sn} (max_row={ws.max_row}, max_col={ws.max_column}) ===")
    rows = list(ws.iter_rows(min_row=1, max_row=8, values_only=True))
    for i, r in enumerate(rows):
        print(f"  L{i+1}:", [str(c)[:25] if c is not None else '' for c in r[:12]])
