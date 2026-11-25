import openpyxl
from collections import defaultdict
wb = openpyxl.load_workbook('/home/z/my-project/upload/Analyse Factures Clients (1).xlsx', read_only=True, data_only=True)
ws = wb['DÉTAIL FACTURES']
rows = list(ws.iter_rows(min_row=2, values_only=True))
labels = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_qty':0,'sum_ca':0,'sample':[]})
for r in rows:
    if r[5] is None: continue
    lib = str(r[5]).upper()
    if 'BOX 9' in lib or 'ETUI X9' in lib or 'BOITE 9' in lib:
        pu = r[7]; qte = r[6]; ca = r[9]
        if pu and isinstance(pu,(int,float)) and pu>0:
            labels[lib]['sum_pu'] += pu; labels[lib]['n'] += 1
            labels[lib]['sum_qty'] += qte or 0; labels[lib]['sum_ca'] += ca or 0
            if len(labels[lib]['sample'])<3: labels[lib]['sample'].append((pu,qte,ca))
print("Libelles Box 9 dans Analyse Factures (toutes periodes):")
for lib,d in sorted(labels.items()):
    print(f"  {lib:40s} n={d['n']:4d} moy_PU={d['sum_pu']/d['n']:.3f} sum_qty={d['sum_qty']} sum_ca={d['sum_ca']:.2f}")
    print(f"    samples (PU,qte,ca): {d['sample']}")
    print(f"    -> CA/qty = {d['sum_ca']/d['sum_qty']:.3f}  (=PU moy pondere)")
    print(f"    -> si PU=par box: PU/box={d['sum_pu']/d['n']:.3f}")
    print(f"    -> si PU=par colis(4box): PU/box={d['sum_pu']/d['n']/4:.3f}")
