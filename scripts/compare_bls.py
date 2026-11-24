#!/usr/bin/env python3
"""Compare BL par BL: fichier ventes vs base Sale pour octobre 2026."""
import json
from collections import defaultdict

with open('/home/z/my-project/scripts/ventes_file_bls.json') as f:
    file_bls = json.load(f)

with open('/home/z/my-project/scripts/base_sales_oct.json') as f:
    base_data = json.load(f)
base_bls = base_data['bls']

print(f"Fichier: {len(file_bls)} BL, {sum(b['ht'] for b in file_bls):.2f} €")
print(f"Base:    {len(base_bls)} BL, {sum(b['ht'] for b in base_bls):.2f} €")

# Index by ref
file_map = {b['ref']: b for b in file_bls}
base_map = {b['bl']: b for b in base_bls}

file_refs = set(file_map.keys())
base_refs = set(base_map.keys())

only_file = file_refs - base_refs
only_base = base_refs - file_refs
common = file_refs & base_refs

print(f"\n=== Résumé ===")
print(f"  Communs:     {len(common)}")
print(f"  Que fichier: {len(only_file)}")
print(f"  Que base:    {len(only_base)}")

# BL que fichier (manquants en base)
print(f"\n=== BL dans fichier mais PAS en base ({len(only_file)}) ===")
for r in sorted(only_file):
    b = file_map[r]
    print(f"  {r} | {b['date']} | {b['client'][:45]:45s} | {b['ht']:9.2f} € | {b['commercial']}")

# BL que base (en trop)
print(f"\n=== BL en base mais PAS dans fichier ({len(only_base)}) ===")
for r in sorted(only_base):
    b = base_map[r]
    print(f"  {r} | {b['date']} | {b['enseigne'][:45]:45s} | {b['ht']:9.2f} € | {b['agent']}")

# BL communs avec CA différent
print(f"\n=== BL communs avec CA différent ===")
diff_ca = []
for r in sorted(common):
    fh = file_map[r]['ht']
    bh = base_map[r]['ht']
    if abs(fh - bh) > 0.01:
        diff_ca.append((r, fh, bh, bh - fh))
        print(f"  {r} | fichier={fh:9.2f} | base={bh:9.2f} | Δ={bh-fh:+8.2f} | {file_map[r]['client'][:40]}")
print(f"  Total: {len(diff_ca)} BL avec CA différent")
if diff_ca:
    sum_f = sum(d[1] for d in diff_ca)
    sum_b = sum(d[2] for d in diff_ca)
    print(f"  Σ fichier: {sum_f:.2f} € | Σ base: {sum_b:.2f} € | Δ total: {sum_b-sum_f:+.2f} €")

# BL communs avec agent différent (comparaison fichier.commercial normalisé vs base.agent)
print(f"\n=== BL communs avec agent différent ===")
# Normalisation: fichier (vide ou SEBASTIEN GASNIER) -> KOOK'S, sinon tel quel
def norm_agent_file(a):
    if not a or a == "KOOK'S":
        return "KOOK'S"
    if a == "SEBASTIEN GASNIER":
        return "SEBASTIEN GASNIER"
    return a

diff_agent = []
for r in sorted(common):
    fa = norm_agent_file(file_map[r]['commercial'])
    ba = base_map[r]['agent']
    if fa != ba:
        diff_agent.append((r, fa, ba, file_map[r]['ht']))
        print(f"  {r} | fichier={fa:20s} | base={ba:20s} | ht={file_map[r]['ht']:9.2f} | {file_map[r]['client'][:35]}")
print(f"  Total: {len(diff_agent)} BL avec agent différent")

# Récap par agent (écart fichier vs base)
print(f"\n=== Récap par agent (fichier vs base, communs) ===")
by_agent_file = defaultdict(lambda: {'nb': 0, 'ht': 0})
by_agent_base = defaultdict(lambda: {'nb': 0, 'ht': 0})
for r in common:
    fa = norm_agent_file(file_map[r]['commercial'])
    ba = base_map[r]['agent']
    by_agent_file[fa]['nb'] += 1
    by_agent_file[fa]['ht'] += file_map[r]['ht']
    by_agent_base[ba]['nb'] += 1
    by_agent_base[ba]['ht'] += base_map[r]['ht']

all_agents = set(by_agent_file.keys()) | set(by_agent_base.keys())
for a in sorted(all_agents):
    f = by_agent_file.get(a, {'nb':0,'ht':0})
    b = by_agent_base.get(a, {'nb':0,'ht':0})
    print(f"  {a:20s} | fichier: {f['nb']:3d} BL {f['ht']:10.2f}€ | base: {b['nb']:3d} BL {b['ht']:10.2f}€ | Δ={b['ht']-f['ht']:+8.2f}€")

# Date check
print(f"\n=== BL communs avec date différente ===")
diff_date = []
for r in sorted(common):
    fd = file_map[r]['date']
    bd = base_map[r]['date']
    # Normaliser formats DD/MM/YYYY vs YYYY-MM-DD
    fd_norm = fd
    if fd and '/' in fd:
        parts = fd.split('/')
        fd_norm = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    if fd_norm != bd:
        diff_date.append((r, fd, bd))
print(f"  Total: {len(diff_date)} BL avec date différente (sur {len(common)} communs)")
for r, fd, bd in diff_date[:10]:
    print(f"  {r} | fichier={fd} | base={bd}")
