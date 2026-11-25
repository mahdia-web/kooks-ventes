import openpyxl
from collections import defaultdict
wb = openpyxl.load_workbook('/home/z/my-project/upload/Analyse Factures Clients (1).xlsx', read_only=True, data_only=True)
ws = wb['DÉTAIL FACTURES']
rows = list(ws.iter_rows(min_row=2, values_only=True))
# Colonnes: Date,Facture,Code client,Client,Référence,Libellé,Qté,PU HT,Remise %,Montant HT payé,TVA %,BL réf.
box9 = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_qty':0,'sum_ca':0})
lot2 = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_qty':0,'sum_ca':0})
for r in rows:
    if r[5] is None: continue
    lib = str(r[5]).upper()
    pu = r[7]
    qte = r[6]
    ca = r[9]
    if 'BOX 9' in lib or 'BOITE 9' in lib or 'BOÎTE 9' in lib:
        if pu and isinstance(pu,(int,float)) and pu>0:
            box9[lib]['sum_pu'] += pu; box9[lib]['n'] += 1
            box9[lib]['sum_qty'] += qte or 0; box9[lib]['sum_ca'] += ca or 0
    if 'LOT 2' in lib:
        if pu and isinstance(pu,(int,float)) and pu>0:
            lot2[lib]['sum_pu'] += pu; lot2[lib]['n'] += 1
            lot2[lib]['sum_qty'] += qte or 0; lot2[lib]['sum_ca'] += ca or 0

print("=== BOX 9 (PU par ligne, Qté, CA) ===")
for lib,d in sorted(box9.items()):
    print(f"  {lib:35s} n={d['n']:4d} moy_PU={d['sum_pu']/d['n']:.3f} sum_Qté={d['sum_qty']} sum_CA={d['sum_ca']:.2f}")
    print(f"    -> CA/Qté (PU moy pondéré) = {d['sum_ca']/d['sum_qty']:.3f}")
    print(f"    -> si PU=par colis: PU moy/format = {d['sum_pu']/d['n']/4:.3f} (4 box/colis)")

print("\n=== LOT 2 (PU par ligne, Qté, CA) ===")
for lib,d in sorted(lot2.items()):
    print(f"  {lib:35s} n={d['n']:4d} moy_PU={d['sum_pu']/d['n']:.3f} sum_Qté={d['sum_qty']} sum_CA={d['sum_ca']:.2f}")
    print(f"    -> CA/Qté (PU moy pondéré) = {d['sum_ca']/d['sum_qty']:.3f}")
    print(f"    -> si PU=par colis: PU moy/format = {d['sum_pu']/d['n']/6:.3f} (6 lots/colis)")
