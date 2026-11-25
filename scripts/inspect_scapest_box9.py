import openpyxl
from collections import defaultdict
wb = openpyxl.load_workbook('/home/z/my-project/upload/SCAPEST COLIS.xlsx', read_only=True, data_only=True)
ws = wb['Sheet1']
rows = list(ws.iter_rows(min_row=3, values_only=True))
# Colonnes: 0=Ref,1=Client,2=Produit,3=Colis(format),4=Nb. Colis,5=Poids,6=Pièces,7=Com.Lot,8=PU,9=PR,10=Total HT,11=Total Ac,12=PU Achat
box9 = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_colis':0,'sum_pieces':0,'sum_ca':0,'samples':[]})
lot2 = defaultdict(lambda: {'sum_pu':0,'n':0,'sum_colis':0,'sum_pieces':0,'sum_ca':0,'samples':[]})
for r in rows:
    if r[2] is None: continue
    prod = str(r[2]).upper()
    fmt = str(r[3]) if r[3] else ''
    pu = r[8]; colis = r[4]; pieces = r[6]; ca = r[10]
    if isinstance(pu,str):
        try: pu = float(pu.replace(',','.').replace('\u202f','').replace(' ',''))
        except: pu = None
    if isinstance(colis,str):
        try: colis = float(colis.replace(',','.').replace('\u202f',''))
        except: colis = None
    if isinstance(pieces,str):
        try: pieces = float(pieces.replace(',','.').replace('\u202f',''))
        except: pieces = None
    if isinstance(ca,str):
        try: ca = float(ca.replace(',','.').replace('\u202f',''))
        except: ca = None
    if pu and isinstance(pu,(int,float)) and pu>0:
        is_box = 'BOX' in prod or 'ETUI' in prod or fmt=='COLIS PCB 4'
        is_lot2 = ('LOT' in prod or 'X2' in prod or 'COOKIE DOUGH' in prod) and fmt=='BARQUETTE PCB 6'
        if is_box:
            box9[prod]['sum_pu'] += pu; box9[prod]['n'] += 1
            box9[prod]['sum_colis'] += colis or 0; box9[prod]['sum_pieces'] += pieces or 0; box9[prod]['sum_ca'] += ca or 0
            if len(box9[prod]['samples'])<4: box9[prod]['samples'].append((pu,colis,pieces,ca,fmt))
        elif is_lot2:
            lot2[prod]['sum_pu'] += pu; lot2[prod]['n'] += 1
            lot2[prod]['sum_colis'] += colis or 0; lot2[prod]['sum_pieces'] += pieces or 0; lot2[prod]['sum_ca'] += ca or 0

print("=== SCAPEST - BOX 9 (COLIS PCB 4) ===")
for lib,d in sorted(box9.items()):
    print(f"  {lib:30s} n={d['n']:3d} moy_PU={d['sum_pu']/d['n']:.3f} sum_colis={d['sum_colis']:.0f} sum_pieces={d['sum_pieces']:.0f} sum_CA={d['sum_ca']:.2f}")
    print(f"    samples (PU, NbColis, Pieces, CA, format): {d['samples']}")
    if d['sum_colis']>0:
        print(f"    -> PU/colis moy = {d['sum_pu']/d['n']:.3f}")
        print(f"    -> CA/colis = {d['sum_ca']/d['sum_colis']:.3f}  (PU pondéré par colis)")
        if d['sum_pieces']>0: print(f"    -> pieces/colis = {d['sum_pieces']/d['sum_colis']:.2f}  (= nb box/colis ?)")

print("\n=== SCAPEST - LOT 2 (BARQUETTE PCB 6) ===")
for lib,d in sorted(lot2.items()):
    print(f"  {lib:30s} n={d['n']:3d} moy_PU={d['sum_pu']/d['n']:.3f} sum_colis={d['sum_colis']:.0f} sum_pieces={d['sum_pieces']:.0f} sum_CA={d['sum_ca']:.2f}")
    if d['sum_colis']>0:
        print(f"    -> CA/colis = {d['sum_ca']/d['sum_colis']:.3f}")
        if d['sum_pieces']>0: print(f"    -> pieces/colis = {d['sum_pieces']/d['sum_colis']:.2f}")
