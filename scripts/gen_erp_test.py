"""Génère un fichier Excel de ventes sans N° BL (simule le nouvel ERP).
"""
from pathlib import Path
from datetime import date, timedelta
import random
from openpyxl import Workbook

output = Path('/home/z/my-project/upload/nouveau-erp-octobre.xlsx')
output.parent.mkdir(parents=True, exist_ok=True)

wb = Workbook()
ws = wb.active
ws.title = "VENTES"

# En-têtes du nouvel ERP (pas de N° BL, noms de colonnes différents)
ws.append([
    "Date Vente",
    "Client",
    "Canal",          # au lieu de TYPE (Direct/Centrale)
    "Commercial",     # au lieu de AGENT
    "CA HT",
    "CA TTC",
    "Taux Commission",
    "Montant Commission",
])

# 8 ventes d'octobre 2026 sans N° BL
data = [
    ("2026-10-03", "INTERMARCHE COULOUNIEIX", "Direct", "CAP FRAIS", 426.88, 450.36, 0.07, 29.88),
    ("2026-10-03", "THOUARS DISTRIBUTION", "Direct", "CAP FRAIS", 454.72, 479.73, 0.07, 31.83),
    ("2026-10-04", "SCAOUEST", "Centrale", "CAP FRAIS", 357.28, 376.93, 0.05, 17.86),
    ("2026-10-05", "U EXPRESS RENNES HOCHE", "Direct", "CAP FRAIS", 361.92, 381.83, 0.07, 25.33),
    ("2026-10-07", "SCACHAP", "Centrale", "BROCARD", 1225.50, 1294.13, 0.05, 61.28),
    ("2026-10-08", "OTERA SAS", "Centrale", "BROCARD", 980.20, 1035.17, 0.05, 49.01),
    ("2026-10-10", "ALDOUEST", "Centrale", "BROCARD", 540.75, 571.00, 0.05, 27.04),
    ("2026-10-12", "SCAPEST", "Centrale", "CAP FRAIS", 1845.30, 1948.65, 0.05, 92.27),
]

for row in data:
    ws.append(row)

wb.save(output)
print(f"Fichier créé : {output}")
print(f"Taille : {output.stat().st_size} octets")
print(f"Ventes : {ws.max_row - 1}")
print(f"Colonnes : Date Vente, Client, Canal, Commercial, CA HT, CA TTC, Taux Commission, Montant Commission")
