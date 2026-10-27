"""Analyse les 4 fichiers de ventes Centrale."""
from pathlib import Path
import pandas as pd

FILES = [
    ('SCAPEST BROCARD.xls', 'BROCARD'),
    ('ALDOUEST CAP FRAIS.xls', 'CAP FRAIS'),
    ('SCAOUEST CAP FRAIS.xls', 'CAP FRAIS'),
    ('SCACHAP CAP FRAIS.xls', 'CAP FRAIS'),
]

for filename, agent in FILES:
    filepath = Path('/home/z/my-project/upload') / filename
    print(f"\n{'='*80}")
    print(f"FICHIER : {filename} (agent: {agent})")
    print('='*80)
    try:
        df = pd.read_excel(filepath)
        print(f"Colonnes: {list(df.columns)}")
        print(f"Lignes: {len(df)}")
        print(f"\n5 premières lignes:")
        print(df.head())
        print(f"\nDernière ligne (peut être un total):")
        print(df.tail(1))
    except Exception as e:
        print(f"Erreur: {e}")
