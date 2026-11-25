import openpyxl
wb = openpyxl.load_workbook('/home/z/my-project/upload/SCAPEST COLIS.xlsx', read_only=True, data_only=True)
print("Feuilles:", wb.sheetnames)
for sn in wb.sheetnames[:2]:
    ws = wb[sn]
    print(f"\n=== {sn} (rows={ws.max_row}, cols={ws.max_column}) ===")
    for i, r in enumerate(ws.iter_rows(min_row=1, max_row=6, values_only=True)):
        print(f"  L{i+1}:", [str(c)[:22] if c is not None else '' for c in r[:14]])
