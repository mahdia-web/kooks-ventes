#!/usr/bin/env python3
"""
Pré-remplit les prix d'achat Kooks depuis le screenshot 'Capture 2026-10-07 155643'.

6 parfums × 4 conditionnements (Lot de 2, Indiv Fouro, Indiv PAV 8, BOX 9).

Données extraites du screenshot :
- LOT DE 2: 12 pots/colis, 6 lots de 2/colis, format = 2 pots
- INDIV FOURO: 8 pots/colis, pas de format
- INDIV PAV 8: 8 pots/colis, pas de format
- BOX 9: 36 pots/colis, 4 boîtes de 9/colis, format = 9 pots

Prix par parfum et conditionnement :
LOT DE 2:
  Original:       pot=0.483€, format=0.965€,  colis=5.79€
  Peanut butter:  pot=0.518€, format=1.035€, colis=6.21€
  Caramel:        pot=0.570€, format=1.14€,  colis=6.84€
  Crispy choco:   pot=0.560€, format=1.12€,  colis=6.72€
  Spec:           pot=0.525€, format=1.05€,  colis=6.30€
  Coco:           pot=0.610€, format=1.22€,  colis=7.32€

INDIV FOURO (du screenshot, prix au pot seulement pour 3 parfums):
  Original:       pot=0.485€  colis=0.485*8=3.88€
  Peanut butter:  pot=0.505€  colis=4.04€
  Caramel:        pot=0.590€  colis=4.72€
  (autres parfums non listés)

INDIV PAV 8 (du screenshot):
  Original:       pot=0.480€, colis=3.84€
  Peanut butter:  pot=0.515€, colis=4.12€
  Caramel:        pot=0.565€, colis=4.52€
  Crispy choco:   pot=0€,     colis=0€     (non disponible)
  Spec:           pot=0.520€, colis=4.16€
  Coco:           pot=0€,     colis=0€     (non disponible)

BOX 9 (du screenshot, seul Original a un prix):
  Original:       pot=0.491€, format=4.42€, colis=17.68€
"""
import json
import urllib.request

BASE_URL = "https://venteskooks.vercel.app"

def api_call(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read().decode()[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# === 1. Récupère ou crée les produits ===
print("=== Récupération/Création des produits ===\n")

# Récupère les produits existants
existing_res = api_call("GET", "/api/products")
products_by_name = {}
if existing_res.get("ok"):
    for p in existing_res["data"]:
        products_by_name[p["name"]] = p
        print(f"  [exists] {p['name']} (id={p['id']}) — {p['potsPerColis']} pots/colis")

# Met à jour LOT DE 2 avec potsPerFormat=2
PRODUCTS_TO_SETUP = [
    {
        "name": "LOT DE 2 (COLIS)",
        "potsPerColis": 12,
        "potsPerFormat": 2,  # lot de 2 pots
        "description": "Lot de 2 colis — 12 pots/colis (6 lots de 2)",
    },
    {
        "name": "INDIV FOURO (COLIS)",
        "potsPerColis": 8,
        "potsPerFormat": None,
        "description": "Indiv Fouro — 8 pots/colis (pas de format)",
    },
    {
        "name": "INDIV PAV 8 (COLIS)",
        "potsPerColis": 8,
        "potsPerFormat": None,
        "description": "Indiv PAV 8 — 8 pots/colis (pas de format)",
    },
    {
        "name": "BOX 9 (COLIS)",
        "potsPerColis": 36,
        "potsPerFormat": 9,  # boîte de 9 pots
        "description": "Box 9 — 36 pots/colis (4 boîtes de 9)",
    },
]

# Si l'ancien "INDIV (COLIS)" existe, on le renomme en "INDIV FOURO (COLIS)"
if "INDIV (COLIS)" in products_by_name and "INDIV FOURO (COLIS)" not in products_by_name:
    p = products_by_name["INDIV (COLIS)"]
    print(f"\n  [rename] INDIV (COLIS) → INDIV FOURO (COLIS)")
    res = api_call("PATCH", f"/api/products/{p['id']}", {
        "name": "INDIV FOURO (COLIS)",
        "potsPerColis": 8,
        "potsPerFormat": None,
        "description": "Indiv Fouro — 8 pots/colis (pas de format)",
    })
    if res.get("ok"):
        # Met à jour notre map local
        del products_by_name["INDIV (COLIS)"]
        products_by_name["INDIV FOURO (COLIS)"] = res["data"]
        print(f"  [ok] renommé")
    else:
        print(f"  [err] {res.get('error')}")

# Crée ou met à jour chaque produit
for p_setup in PRODUCTS_TO_SETUP:
    if p_setup["name"] in products_by_name:
        # Met à jour potsPerFormat si nécessaire
        p = products_by_name[p_setup["name"]]
        if p.get("potsPerFormat") != p_setup["potsPerFormat"] or p.get("potsPerColis") != p_setup["potsPerColis"]:
            print(f"  [update] {p_setup['name']}: potsPerColis={p_setup['potsPerColis']}, potsPerFormat={p_setup['potsPerFormat']}")
            res = api_call("PATCH", f"/api/products/{p['id']}", {
                "potsPerColis": p_setup["potsPerColis"],
                "potsPerFormat": p_setup["potsPerFormat"],
                "description": p_setup["description"],
            })
            if res.get("ok"):
                products_by_name[p_setup["name"]] = res["data"]
                print(f"  [ok] mis à jour")
            else:
                print(f"  [err] {res.get('error')}")
    else:
        # Crée le produit
        print(f"  [create] {p_setup['name']}")
        res = api_call("POST", "/api/products", {
            "name": p_setup["name"],
            "description": p_setup["description"],
            "format": "colis",
            "potsPerColis": p_setup["potsPerColis"],
            "unit": "colis",
            "isActive": True,
        })
        if res.get("ok"):
            # Update potsPerFormat via PATCH (since POST doesn't accept it)
            pid = res["data"]["id"]
            if p_setup["potsPerFormat"]:
                upd = api_call("PATCH", f"/api/products/{pid}", {
                    "potsPerFormat": p_setup["potsPerFormat"],
                })
                if upd.get("ok"):
                    res["data"] = upd["data"]
            products_by_name[p_setup["name"]] = res["data"]
            print(f"  [ok] créé (id={pid})")
        else:
            print(f"  [err] {res.get('error')}")

# === 2. Définit les prix d'achat ===
# Format: { product_name: { parfum: { variant, pot, format, colis } } }
# Skip entries where pot=0 (non disponible)
ACHAT = {
    "LOT DE 2 (COLIS)": {
        # 6 parfums, format = lot de 2 pots
        "Original":        {"variant": None, "pot": 0.483, "format": 0.965, "colis": 5.79},
        "Peanut butter":   {"variant": None, "pot": 0.518, "format": 1.035, "colis": 6.21},
        "Caramel":         {"variant": None, "pot": 0.570, "format": 1.14,  "colis": 6.84},
        "Crispy choco":    {"variant": None, "pot": 0.560, "format": 1.12,  "colis": 6.72},
        "Spec":            {"variant": None, "pot": 0.525, "format": 1.05,  "colis": 6.30},
        "Coco":            {"variant": None, "pot": 0.610, "format": 1.22,  "colis": 7.32},
    },
    "INDIV FOURO (COLIS)": {
        # 3 parfums seulement (Original, Peanut butter, Caramel)
        "Original":        {"variant": None, "pot": 0.485, "format": None, "colis": 0.485*8},
        "Peanut butter":   {"variant": None, "pot": 0.505, "format": None, "colis": 0.505*8},
        "Caramel":         {"variant": None, "pot": 0.590, "format": None, "colis": 0.590*8},
    },
    "INDIV PAV 8 (COLIS)": {
        "Original":        {"variant": None, "pot": 0.480, "format": None, "colis": 3.84},
        "Peanut butter":   {"variant": None, "pot": 0.515, "format": None, "colis": 4.12},
        "Caramel":         {"variant": None, "pot": 0.565, "format": None, "colis": 4.52},
        # Crispy choco et Coco non disponibles (pot=0)
        "Spec":            {"variant": None, "pot": 0.520, "format": None, "colis": 4.16},
    },
    "BOX 9 (COLIS)": {
        # Seul Original a un prix pour BOX 9
        "Original":        {"variant": None, "pot": 0.491, "format": 4.42, "colis": 17.68},
    },
}

# === 3. Crée les prix d'achat ===
print("\n=== Création des prix d'achat ===\n")
total_created = 0
total_skipped = 0
for product_name, parfums in ACHAT.items():
    p = products_by_name.get(product_name)
    if not p:
        print(f"  [skip] Produit '{product_name}' introuvable")
        continue
    print(f"\n  {product_name} (id={p['id']}, {p['potsPerColis']} pots/colis):")
    for parfum, prices in parfums.items():
        if prices["pot"] == 0:
            print(f"    [skip] {parfum} (non disponible — pot=0€)")
            total_skipped += 1
            continue
        body = {
            "productId": p["id"],
            "parfum": parfum,
            "pricePerPot": prices["pot"],
            "pricePerColis": prices["colis"],
        }
        if prices.get("format"):
            body["pricePerFormat"] = prices["format"]
        if prices.get("variant"):
            body["variant"] = prices["variant"]
        res = api_call("POST", "/api/products/purchase-prices", body)
        if res.get("ok"):
            d = res["data"]
            print(f"    [ok] {parfum}: pot={d['pricePerPot']}€, format={d.get('pricePerFormat')}€, colis={d['pricePerColis']}€")
            total_created += 1
        else:
            print(f"    [err] {parfum}: {res.get('error')}")
            total_skipped += 1

print(f"\n=== Résumé ===")
print(f"  Prix d'achat créés: {total_created}")
print(f"  Entrées ignorées: {total_skipped}")

# === 4. Vérification finale ===
print("\n=== Vérification finale ===\n")
res = api_call("GET", "/api/products?withPrices=true")
if res.get("ok"):
    for p in res["data"]:
        print(f"\n{p['name']} ({p['potsPerColis']} pots/colis, format={p.get('potsPerFormat') or '-'})")
        pps = p.get("purchasePrices", [])
        # Garde seulement le prix courant (endDate null)
        current = [pp for pp in pps if pp.get("endDate") is None]
        if current:
            for pp in current:
                parfum_str = f"{pp['parfum']}"
                if pp.get("variant"):
                    parfum_str += f" ({pp['variant']})"
                print(f"  • {parfum_str}: pot={pp['pricePerPot']}€, format={pp.get('pricePerFormat')}€, colis={pp['pricePerColis']}€")
        else:
            print(f"  (aucun prix d'achat)")
