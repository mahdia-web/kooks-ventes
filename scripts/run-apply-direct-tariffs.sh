#!/bin/bash
# Applique les tarifs DIRECT par lots de 30 (sous la limite Vercel 60s).
# total = 87 clients × 13 produits = 1131 opérations
# batches de 30 → ~38 requêtes
set -e
BASE="https://venteskooks.vercel.app/api/products/apply-direct-tariffs"
TOTAL=1131
BATCH=30
DONE=0
i=0
while [ $i -lt $TOTAL ]; do
  SIZE=$((BATCH))
  REMAINING=$((TOTAL - i))
  [ $SIZE -gt $REMAINING ] && SIZE=$REMAINING
  # Lance le batch en arrière-plan (max 50s)
  RES=$(timeout 55 curl -s -X POST "${BASE}?batch=${i}&size=${SIZE}&cb=$(date +%s%N)" 2>/dev/null || echo '{}')
  UPSERTED=$(echo "$RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('upserted',0))" 2>/dev/null || echo "ERR")
  DONE=$((DONE + UPSERTED))
  echo "batch=${i} size=${SIZE} → upserted=${UPSERTED} (cumul ${DONE}/${TOTAL})"
  i=$((i + SIZE))
done
echo "=== TOTAL TRAITÉ: ${DONE} ==="
