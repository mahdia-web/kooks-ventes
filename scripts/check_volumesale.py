# SCAPEST: Nb. Colis=9, Pièces=54, PU=14.78 (par colis logistique)
# Analyse Factures: Qté=16 (formats), PU=11.226 (par format)
# Laquelle a ete importee dans VolumeSale ? Verifions via la route stats (bon params)
import urllib.request, json
url = "https://venteskooks.vercel.app/api/volumes/stats?startDate=2026-10-01&endDate=2026-10-31&cb=123"
try:
    with urllib.request.urlopen(url, timeout=60) as r:
        j = json.loads(r.read())
    print("Keys:", list(j.keys())[:15])
    print("totalCA:", j.get('totalCA'))
    print("totalQuantity:", j.get('totalQuantity'))
    print("totalPots:", j.get('totalPots'))
    print("recordsWithPrice:", j.get('recordsWithPrice'))
    bf = j.get('byFormat') or j.get('formats') or []
    print("\nbyFormat:")
    for f in bf[:8]:
        print("  ", f)
except Exception as e:
    print("ERR:", e)
