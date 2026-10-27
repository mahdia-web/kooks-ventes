"""Analyse la structure des fichiers CAP FRAIS VENTE.xls et BROCARD VENTE.xls"""
from pathlib import Path
from openpyxl import load_workbook
import xlrd  # Pour anciens .xls
from datetime import datetime, date

FILES = [
    Path('/home/z/my-project/upload/CAP FRAIS VENTE.xls'),
    Path('/home/z/my-project/upload/BROCARD VENTE.xls'),
]

for FILE in FILES:
    print(f"\n{'='*80}")
    print(f"FICHIER : {FILE.name} ({FILE.stat().st_size} octets)")
    print('='*80)

    # Les .xls sont l'ancien format - utiliser xlrd
    try:
        wb = xlrd.open_workbook(str(FILE))
        print(f"Feuilles : {wb.sheet_names()}")

        for sheet_name in wb.sheet_names():
            ws = wb.sheet_by_name(sheet_name)
            print(f"\n  --- Feuille : {sheet_name} (nrows={ws.nrows}, ncols={ws.ncols}) ---")

            # Afficher les 10 premières lignes
            print(f"  10 premières lignes :")
            for row_idx in range(min(10, ws.nrows)):
                row_data = []
                for col_idx in range(min(ws.ncols, 15)):
                    cell = ws.cell(row_idx, col_idx)
                    v = cell.value
                    if v == '' or v is None:
                        row_data.append('')
                    elif cell.ctype == xlrd.XL_CELL_DATE:
                        try:
                            date_tuple = xlrd.xldate_as_tuple(v, wb.datemode)
                            row_data.append(f"DATE:{date_tuple}")
                        except:
                            row_data.append(f"DATE?{v}")
                    elif isinstance(v, float):
                        if v == int(v):
                            row_data.append(str(int(v)))
                        else:
                            row_data.append(str(v))
                    else:
                        s = str(v).strip()
                        if len(s) > 35:
                            s = s[:35] + '...'
                        row_data.append(s)
                print(f"    L{row_idx+1}: {row_data}")

            # Trouver les en-têtes (ligne avec "Date" ou "Client")
            for try_row in range(min(5, ws.nrows)):
                row_vals = [str(ws.cell(row_idx=try_row, col_idx=c).value).lower().strip() if ws.cell(try_row, c).value else '' for c in range(ws.ncols)]
                if any('date' in s for s in row_vals) and any('client' in s or 'enseigne' in s or 'montant' in s or 'ca' in s for s in row_vals):
                    print(f"\n  En-têtes (ligne {try_row+1}) : {row_vals}")
                    break
    except Exception as e:
        print(f"Erreur xlrd: {e}")
        # Fallback avec pandas
        try:
            import pandas as pd
            print("Tentative avec pandas...")
            df = pd.read_excel(FILE)
            print(f"Colonnes: {list(df.columns)}")
            print(f"5 premières lignes:")
            print(df.head())
        except Exception as e2:
            print(f"Erreur pandas: {e2}")
