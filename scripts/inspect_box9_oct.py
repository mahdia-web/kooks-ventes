import openpyxl
from collections import defaultdict
# Analyse Factures: donnees Oct 2026 pour Box 9 et Lot 2
wb = openpyxl.load_workbook('/home/z/my-project/upload/Analyse Factures Clients (1).xlsx', read_only=True, data_only=True)
ws = wb['DÉTAIL FACTURES']
rows = list(ws.iter_rows(min_row=2, values_only=True))
# Colonnes: 0=Date,1=Facture,2=Code,3=Client,4=Ref,5=Libellé,6=Qté,7=PU HT,8=Remise,9=Montant HT,10=TVA,11=BL
box9_oct = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_qty':0,'sum_ca':0,'sample_pu':[]})
lot2_oct = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_qty':0,'sum_ca':0,'sample_pu':[]})
for r in rows:
    if r[0] is None or r[5] is None: continue
    d = r[0]
    # Date comme datetime ou string
    import datetime
    if isinstance(d, datetime.datetime):
        if not (d.year==2026 and d.month==10): continue
    elif isinstance(d, str):
        if '2026-10' not in d: continue
    else: continue
    lib = str(r[5]).upper()
    pu = r[7]; qte = r[6]; ca = r[9]
    if 'BOX 9' in lib or 'BOITE 9' in lib or 'BOÎTE 9' in lib:
        if pu and isinstance(pu,(int,float)) and pu>0:
            box9_oct[lib]['sum_pu'] += pu; box9_oct[lib]['n'] += 1
            box9_oct[lib]['sum_qty'] += qte or 0; box9_oct[lib]['sum_ca'] += ca or 0
            if len(box9_oct[lib]['sample_pu']) < 5: box9_oct[lib]['sample_pu'].append((pu,qte,ca))
    if 'LOT 2' in lib:
        if pu and isinstance(pu,(int,float)) and pu>0:
            lot2_oct[lib]['sum_pu'] += pu; lot2_oct[lib]['n'] += 1
            lot2_oct[lib]['sum_qty'] += qte or 0; lot2_oct[lib]['sum_ca'] += ca or 0

print("=== OCTOBRE 2026 - BOX 9 (Analyse Factures) ===")
for lib,d in sorted(box9_oct.items()):
    print(f"  {lib:35s} n={d['n']:3d} moy_PU={d['sum_pu']/d['n']:.3f} sum_Qté={d['sum_qty']} sum_CA={d['sum_ca']:.2f}")
    print(f"    samples (PU, Qté, CA): {d['sample_pu']}")
    print(f"    -> CA/Qté = {d['sum_ca']/d['sum_qty']:.3f}  (=PU moy pondéré)")

print("\n=== OCTOBRE 2026 - LOT 2 (Analyse Factures) ===")
for lib,d in sorted(lot2_oct.items()):
    print(f"  {lib:35s} n={d['n']:3d} moy_PU={d['sum_pu']/d['n']:.3f} sum_Qté={d['sum_qty']} sum_CA={d['sum_ca']:.2f}")
    print(f"    -> CA/Qté = {d['sum_ca']/d['sum_qty']:.3f}  (=PU moy pondéré)")
