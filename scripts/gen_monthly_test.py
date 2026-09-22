"""Génère un fichier Excel de ventes mensuelles simple (format plus léger que SUIVI_AGENTS_FINAL_V2.xlsx).
Pour tester la robustesse de l'import avec un format différent.
"""
import random
from pathlib import Path
from datetime import date, timedelta
from openpyxl import Workbook

output = Path('/home/z/my-project/upload/ventes-septembre-2026.xlsx')
output.parent.mkdir(parents=True, exist_ok=True)

wb = Workbook()
ws = wb.active
ws.title = "VENTES"

# En-têtes en ligne 1 (pas de légende)
ws.append([
    "DATE",
    "N° BL",
    "ENSEIGNE",
    "TYPE",
    "AGENT",
    "MT HT (€)",
    "MT TTC (€)",
    "TAUX",
    "COMMISSION (€)",
    "MOIS",
    "ANNÉE",
])

# Quelques ventes de septembre 2026 avec de nouveaux numéros BL
agents = ["CAP FRAIS", "BROCARD"]
products = [
    ("INTERMARCHE coulounieix chamiers (COCHAME)", "Direct"),
    ("THOUARS DISTRIBUTION", "Direct"),
    ("SCAOUEST", "Centrale"),
    ("U EXPRESS RENNES HOCHE ( SAS LES CONQUERANTS )", "Direct"),
    ("SCAPEST", "Centrale"),
    ("SCACHAP", "Centrale"),
    ("OTERA SAS", "Centrale"),
    ("ALDOUEST", "Centrale"),
    ("LECLERC FLEURY LES AUBRIS SOCAMAINE (SAS)", "Direct"),
]

start_date = date(2026, 9, 1)
random.seed(99)

# Démarrer à 90000 pour éviter les conflits avec les BDL existants
bl_counter = 90000
for _ in range(12):
    agent = random.choice(agents)
    enseigne, type_vente = random.choice(products)
    qty = random.randint(1, 8)
    unit_price = random.uniform(50, 500)
    amount_ht = round(qty * unit_price, 2)
    amount_ttc = round(amount_ht * 1.056, 2)
    rate = 0.07 if type_vente == "Direct" else 0.05
    commission = round(amount_ht * rate, 4)
    days_offset = random.randint(0, 25)
    sale_date = start_date + timedelta(days=days_offset)
    bl_counter += 1
    bl_number = f"BDL00009{bl_counter - 90000}"

    ws.append([
        sale_date,
        bl_number,
        enseigne,
        type_vente,
        agent,
        amount_ht,
        amount_ttc,
        rate,
        commission,
        9,  # Mois
        2026,  # Année
    ])

wb.save(output)
print(f"Fichier créé : {output}")
print(f"Taille : {output.stat().st_size} octets")
print(f"Nombre de ventes : {ws.max_row - 1}")
