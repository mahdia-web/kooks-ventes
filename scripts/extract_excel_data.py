"""Extrait les données du fichier SUIVI_AGENTS_FINAL_V2.xlsx vers un fichier JSON
qui sera ensuite consommé par un script TypeScript pour l'import Prisma.
"""
import sys
import json
from pathlib import Path
from datetime import datetime, date
from openpyxl import load_workbook

FILE = Path('/home/z/my-project/upload/SUIVI_AGENTS_FINAL_V2.xlsx')
OUTPUT = Path('/home/z/my-project/scripts/_seed_data.json')

if not FILE.exists():
    print(f"ERREUR : fichier introuvable : {FILE}", file=sys.stderr)
    sys.exit(1)

print(f"Lecture du fichier : {FILE.name}")
wb = load_workbook(FILE, data_only=True)

# ---- 1. ENSEIGNES ----
enseignes_data = []
if 'ENSEIGNES' in wb.sheetnames:
    ws = wb['ENSEIGNES']
    for row_idx in range(2, ws.max_row + 1):
        name = ws.cell(row=row_idx, column=2).value
        type_val = ws.cell(row=row_idx, column=3).value
        agent = ws.cell(row=row_idx, column=4).value
        if name and isinstance(name, str) and name.strip() and type_val and agent:
            enseignes_data.append({
                'name': name.strip(),
                'type': str(type_val).strip(),
                'agent': str(agent).strip(),
            })
print(f"  -> {len(enseignes_data)} enseignes détectées")

# ---- 2. VENTES ----
ventes_data = []
if 'VENTES' in wb.sheetnames:
    ws = wb['VENTES']
    # Les en-têtes sont en ligne 2
    headers = []
    for col_idx in range(1, ws.max_column + 1):
        val = ws.cell(row=2, column=col_idx).value
        headers.append(str(val).strip() if val else '')

    col_map = {
        'date': next((i for i, h in enumerate(headers, 1) if h == 'DATE'), None),
        'bl': next((i for i, h in enumerate(headers, 1) if 'BL' in h.upper()), None),
        'enseigne': next((i for i, h in enumerate(headers, 1) if 'ENSEIGNE' in h.upper()), None),
        'type': next((i for i, h in enumerate(headers, 1) if h == 'TYPE'), None),
        'agent': next((i for i, h in enumerate(headers, 1) if h == 'AGENT'), None),
        'ht': next((i for i, h in enumerate(headers, 1) if 'HT' in h.upper()), None),
        'ttc': next((i for i, h in enumerate(headers, 1) if 'TTC' in h.upper()), None),
        'taux': next((i for i, h in enumerate(headers, 1) if 'TAUX' in h.upper()), None),
        'commission': next((i for i, h in enumerate(headers, 1) if 'COMMISSION' in h.upper()), None),
        'mois': next((i for i, h in enumerate(headers, 1) if h == 'MOIS'), None),
        'annee': next((i for i, h in enumerate(headers, 1) if 'ANN' in h.upper()), None),
    }
    print(f"  Colonnes VENTES : {col_map}")

    skipped = 0
    for row_idx in range(3, ws.max_row + 1):
        date_val = ws.cell(row=row_idx, column=col_map['date']).value if col_map['date'] else None
        bl_val = ws.cell(row=row_idx, column=col_map['bl']).value if col_map['bl'] else None

        if not date_val or not bl_val:
            skipped += 1
            continue
        if not isinstance(date_val, (datetime, date)):
            skipped += 1
            continue
        if not isinstance(bl_val, str) or not bl_val.strip():
            skipped += 1
            continue

        # Conversion date
        if isinstance(date_val, date) and not isinstance(date_val, datetime):
            date_val = datetime.combine(date_val, datetime.min.time())

        # Conversion des autres champs
        def to_str(v):
            return str(v).strip() if v else ''

        def to_float(v):
            try:
                return float(v) if v is not None else 0.0
            except (TypeError, ValueError):
                return 0.0

        def to_int(v, default):
            try:
                return int(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        enseigne_val = ws.cell(row=row_idx, column=col_map['enseigne']).value
        type_val = ws.cell(row=row_idx, column=col_map['type']).value
        agent_val = ws.cell(row=row_idx, column=col_map['agent']).value
        ht_val = ws.cell(row=row_idx, column=col_map['ht']).value
        ttc_val = ws.cell(row=row_idx, column=col_map['ttc']).value
        taux_val = ws.cell(row=row_idx, column=col_map['taux']).value
        commission_val = ws.cell(row=row_idx, column=col_map['commission']).value
        mois_val = ws.cell(row=row_idx, column=col_map['mois']).value
        annee_val = ws.cell(row=row_idx, column=col_map['annee']).value

        ventes_data.append({
            'blNumber': to_str(bl_val),
            'date': date_val.isoformat(),
            'enseigne': to_str(enseigne_val) or 'Inconnu',
            'type': to_str(type_val) or 'Direct',
            'agent': to_str(agent_val) or 'Inconnu',
            'amountHT': to_float(ht_val),
            'amountTTC': to_float(ttc_val),
            'rate': to_float(taux_val),
            'commission': to_float(commission_val),
            'month': to_int(mois_val, date_val.month),
            'year': to_int(annee_val, date_val.year),
        })
    print(f"  -> {len(ventes_data)} ventes détectées ({skipped} lignes ignorées)")

# ---- 3. PARAMETRES (mois/année courants) ----
params_data = {}
if 'PARAMETRES' in wb.sheetnames:
    ws = wb['PARAMETRES']
    # Cherche les cellules contenant "mois" / "annee" dans les 10 premières lignes
    for row_idx in range(1, 11):
        for col_idx in range(1, 7):
            v = ws.cell(row=row_idx, column=col_idx).value
            if isinstance(v, str):
                v_lower = v.strip().lower()
                # Cas 1 : "mois" en colonne C3, valeur en C3 ou suivante
                if v_lower == 'mois':
                    # Tente la cellule suivante
                    for offset in (1, 2, 3):
                        nv = ws.cell(row=row_idx, column=col_idx + offset).value
                        if nv and isinstance(nv, str):
                            params_data['currentMonth'] = nv.strip()
                            break
                elif v_lower in ('annee', 'année'):
                    for offset in (1, 2, 3):
                        nv = ws.cell(row=row_idx, column=col_idx + offset).value
                        if nv and isinstance(nv, (int, float)):
                            params_data['currentYear'] = str(int(nv))
                            break
                        if nv and isinstance(nv, str) and nv.strip().isdigit():
                            params_data['currentYear'] = nv.strip()
                            break

# Si rien trouvé, on prend la dernière année présente dans les ventes
if 'currentYear' not in params_data and ventes_data:
    years = sorted({v['year'] for v in ventes_data})
    params_data['currentYear'] = str(years[-1])
if 'currentMonth' not in params_data and ventes_data:
    # Dernier mois de la dernière année
    last_year = max(v['year'] for v in ventes_data)
    months_last_year = sorted({v['month'] for v in ventes_data if v['year'] == last_year})
    params_data['currentMonth'] = str(months_last_year[-1])

print(f"  -> Paramètres : {params_data}")

# ---- 4. Écriture du JSON ----
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({
    'enseignes': enseignes_data,
    'ventes': ventes_data,
    'params': params_data,
}, ensure_ascii=False, indent=2, default=str))
print(f"\nDonnées sérialisées dans {OUTPUT}")
print(f"  - {len(enseignes_data)} enseignes")
print(f"  - {len(ventes_data)} ventes")
print(f"  - {len(params_data)} paramètres")
