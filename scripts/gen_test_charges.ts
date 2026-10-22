// Generate a test Excel file mimicking the user's charges file format
// (with Émission, Ajout, Montant HT / TVA / TTC combined column, etc.)
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const data = [
  {
    "Numéro de l'achat": "ACH-001",
    "Statut": "Payé",
    "Fournisseur": "TRANSPORTS DUPONT SARL",
    "Numéro de la facture": "FAC-2026-001",
    "Ajout": "2026-09-15",
    "Émission": "2026-09-10",
    "Échéance": "2026-10-10",
    "Montant HT / TVA / TTC": "100.00 / 20.00 / 120.00",
    "Règlement": "Virement",
    "Commentaires": "Livraison Auchan Lyon",
    "Nom du fichier": "achats-sept-2026.xlsx",
    "Source": "Import manuel",
    "Comptes comptables": "625 - Transports",
    "Liaison bancaire": "BNP",
  },
  {
    "Numéro de l'achat": "ACH-002",
    "Statut": "Payé",
    "Fournisseur": "EDF",
    "Numéro de la facture": "FAC-2026-002",
    "Ajout": "2026-09-20",
    "Émission": "2026-09-18",
    "Échéance": "2026-10-18",
    "Montant HT / TVA / TTC": "250.00 / 50.00 / 300.00",
    "Règlement": "Prélèvement",
    "Commentaires": "Électricité entrepôt",
    "Nom du fichier": "achats-sept-2026.xlsx",
    "Source": "Import manuel",
    "Comptes comptables": "606 - Énergie",
    "Liaison bancaire": "BNP",
  },
  {
    "Numéro de l'achat": "ACH-003",
    "Statut": "À payer",
    "Fournisseur": "SCI LOGISTIQUE",
    "Numéro de la facture": "FAC-2026-003",
    "Ajout": "2026-09-30",
    "Émission": "2026-09-30",
    "Échéance": "2026-10-30",
    "Montant HT / TVA / TTC": "1500.00 / 300.00 / 1800.00",
    "Règlement": "Virement",
    "Commentaires": "Loyer entrepôt octobre",
    "Nom du fichier": "achats-sept-2026.xlsx",
    "Source": "Import manuel",
    "Comptes comptables": "613 - Locations",
    "Liaison bancaire": "BNP",
  },
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'ACHATS');
const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
fs.writeFileSync('/tmp/test-charges.xlsx', buf);
console.log('Test Excel file generated: /tmp/test-charges.xlsx');
console.log(`Size: ${buf.length} bytes`);
