# Compare marge-estimee (701 unités) vs clients-analysis (55994 unités) pour Box 9 Oct 2026
# clients-analysis compte TOUTES les lignes Box 9. marge-estimee n'en compte que 701.
# Hypothese: marge-estimee filtre sur les Product en base (isActive=true, parfumId+formatId)
# et n'agrège que les VolumeSale dont parfum+format matchent un Product actif.
# Si un Product "Original - Box de 9" existe mais n'est pas actif, ses ventes sont ignorees.
import urllib.request, json

# 1. marge-estimee
url = "https://venteskooks.vercel.app/api/products/marge-estimee?startDate=01/10/2026&endDate=31/10/2026&includeDirectes=false&includeIndirectes=false&includeSalaires=false&cb=1"
with urllib.request.urlopen(url, timeout=60) as r:
    j = json.loads(r.read())
print("=== marge-estimee Oct 2026: Box 9 ===")
for p in j['products']:
    if 'Box' in p['name']:
        print(f'  {p["name"]}: nbFormats={p["nbFormats"]} CA={p["caProduct"]:.2f} PU/fmt={p["prixVenteMoyenParFormat"]:.3f}')

# 2. clients-analysis (compte tout)
url2 = "https://venteskooks.vercel.app/api/volumes/clients-analysis?startDate=2026-10-01&endDate=2026-10-31&cb=1"
with urllib.request.urlopen(url2, timeout=60) as r:
    j2 = json.loads(r.read())
d = j2.get('data', j2)
ppf = d.get('prixParProduitFormat') or []
total_qty=0; total_ca=0
for x in ppf:
    if 'Box de 9' in str(x.get('format','')):
        total_qty += x['colis']; total_ca += x['caHT']
print(f'\n=== clients-analysis Oct 2026: Box 9 (toutes lignes) ===')
print(f'  TOTAL: qty={total_qty} ca={total_ca:.2f} PU moy={total_ca/total_qty:.3f}')

print(f'\n=== Diagn ===')
print(f'  marge-estimee Box 9: 701 unités, 14265 EUR')
print(f'  clients-analysis:     55994 unités, 482904 EUR')
print(f'  Ratio: marge-estimee ne capture que ~1.3% des ventes Box 9')
print(f'  -> Cause probable: les Product Box 9 actifs ne couvrent pas tous les parfums')
print(f'     OU les VolumeSale Box 9 ont parfum/format=null et extractFromLabel echoue')
