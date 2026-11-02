import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/migrations/sebastien-gasnier
 *
 * Migration des ventes de SEBASTIEN GASNIER (nouveau commercial).
 *
 * Contexte : les ventes de SEBASTIEN GASNIER ont été importées mais ne sont
 * pas visibles dans le dashboard (probablement parce que l'agent n'était pas
 * enregistré dans la table Agent, ou parce que l'enseigne a été mal résolue).
 *
 * Action :
 *   1. Crée l'agent SEBASTIEN GASNIER s'il n'existe pas (taux par défaut 7%/5%)
 *   2. Supprime toutes les ventes existantes avec agent contenant "SEBASTIEN"
 *      (écrase les ventes précédemment attribuées)
 *   3. Insère les 3 nouvelles ventes avec les bonnes données :
 *      - AUCHAN MANDELIEU, 02/11/2026, 575,36€ HT, BL=26000623
 *      - AUCHAN MANDELIEU, 14/10/2026, 723,84€ HT, BL=26000435, Facture FV-00428
 *      - AUCHAN GRASSE, 07/10/2026, 459,36€ HT, BL=26000381, Facture FV-00365
 *   4. Crée les enseignes AUCHAN MANDELIEU et AUCHAN GRASSE si elles n'existent pas
 *   5. Met à jour la période courante si nécessaire
 *
 * Réponse :
 *   {
 *     ok: true,
 *     agent: { name, created: bool },
 *     deletedSales: number,
 *     insertedSales: number,
 *     enseignesCreated: string[],
 *     details: Array<{ bl, date, enseigne, amountHT, agent }>
 *   }
 */
export async function POST(_req: NextRequest) {
  const AGENT_NAME = 'SEBASTIEN GASNIER';
  const DEFAULT_DIRECT_RATE = 0.07;
  const DEFAULT_CENTRALE_RATE = 0.05;

  console.log(`[migration/sebastien-gasnier] Starting migration`);

  // Les 3 ventes à insérer (issues du fichier Excel de l'utilisateur)
  // Type : Direct (AUCHAN MANDELIEU et AUCHAN GRASSE sont des magasins directs)
  // Commission : amountHT × 7% (taux Direct)
  const salesToInsert = [
    {
      blNumber: '26000623',
      date: new Date(2026, 10, 2), // 02/11/2026 (month is 0-indexed: 10 = November)
      enseigne: 'AUCHAN MANDELIEU',
      type: 'Direct',
      agent: AGENT_NAME,
      amountHT: 575.36,
      amountTTC: 607.00,
      invoiceRef: null as string | null,
    },
    {
      blNumber: '26000435',
      date: new Date(2026, 9, 14), // 14/10/2026 (month 9 = October)
      enseigne: 'AUCHAN MANDELIEU',
      type: 'Direct',
      agent: AGENT_NAME,
      amountHT: 723.84,
      amountTTC: 763.65,
      invoiceRef: 'FV-00428',
    },
    {
      blNumber: '26000381',
      date: new Date(2026, 9, 7), // 07/10/2026
      enseigne: 'AUCHAN GRASSE',
      type: 'Direct',
      agent: AGENT_NAME,
      amountHT: 459.36,
      amountTTC: 484.62,
      invoiceRef: 'FV-00365',
    },
  ];

  try {
    // Transaction : tout est atomique — si une étape échoue, tout est annulé
    const result = await db.$transaction(async (tx) => {
      // 1. Crée l'agent SEBASTIEN GASNIER s'il n'existe pas
      let agentCreated = false;
      const existingAgent = await tx.agent.findUnique({ where: { name: AGENT_NAME } });
      if (!existingAgent) {
        await tx.agent.create({
          data: {
            name: AGENT_NAME,
            defaultDirectRate: DEFAULT_DIRECT_RATE,
            defaultCentraleRate: DEFAULT_CENTRALE_RATE,
            isActive: true,
          },
        });
        agentCreated = true;
        console.log(`[migration/sebastien-gasnier] Created agent ${AGENT_NAME}`);
      } else {
        console.log(`[migration/sebastien-gasnier] Agent ${AGENT_NAME} already exists`);
      }

      // 2. Supprime toutes les ventes existantes avec agent contenant "SEBASTIEN"
      //    (catch all variants : "SEBASTIEN", "SEBASTIEN GASNIER", "Sébastien Gasnier", etc.)
      const existingSales = await tx.sale.findMany({
        where: { agent: { contains: 'SEBASTIEN', mode: 'insensitive' } },
        select: { id: true, blNumber: true, enseigne: true, amountHT: true, agent: true, date: true },
      });
      console.log(`[migration/sebastien-gasnier] Found ${existingSales.length} existing SEBASTIEN sales to delete`);
      const totalDeletedCA = existingSales.reduce((s, v) => s + v.amountHT, 0);
      console.log(`[migration/sebastien-gasnier] Total CA of deleted sales: ${totalDeletedCA.toFixed(2)}€`);

      const deleteResult = await tx.sale.deleteMany({
        where: { id: { in: existingSales.map((s) => s.id) } },
      });
      console.log(`[migration/sebastien-gasnier] Deleted ${deleteResult.count} sales`);

      // 3. Crée les enseignes si elles n'existent pas
      const enseigneNames = Array.from(new Set(salesToInsert.map((s) => s.enseigne)));
      const enseignesCreated: string[] = [];
      for (const name of enseigneNames) {
        const existing = await tx.enseigne.findUnique({ where: { name } });
        if (!existing) {
          await tx.enseigne.create({
            data: {
              name,
              type: 'Direct',
              agent: AGENT_NAME,
              commissionRate: null,
              isActive: true,
            },
          });
          enseignesCreated.push(name);
          console.log(`[migration/sebastien-gasnier] Created enseigne: ${name}`);
        }
      }

      // 4. Insère les 3 nouvelles ventes
      let insertedCount = 0;
      const insertedDetails: Array<{
        bl: string; date: string; enseigne: string; amountHT: number; agent: string; commission: number;
      }> = [];

      for (const sale of salesToInsert) {
        const month = sale.date.getMonth() + 1;
        const year = sale.date.getFullYear();
        const rate = sale.type === 'Direct' ? DEFAULT_DIRECT_RATE : DEFAULT_CENTRALE_RATE;
        const commission = sale.amountHT * rate;
        const deduplicationKey = `${sale.blNumber}|${sale.agent}`;

        // Vérifie qu'une vente avec ce BL+agent n'existe pas déjà
        const existing = await tx.sale.findUnique({ where: { deduplicationKey } });
        if (existing) {
          console.log(`[migration/sebastien-gasnier] Sale ${sale.blNumber} already exists — updating`);
          await tx.sale.update({
            where: { id: existing.id },
            data: {
              date: sale.date,
              enseigne: sale.enseigne,
              type: sale.type,
              agent: sale.agent,
              amountHT: sale.amountHT,
              amountTTC: sale.amountTTC,
              rate,
              commission,
              month,
              year,
            },
          });
        } else {
          await tx.sale.create({
            data: {
              blNumber: sale.blNumber,
              deduplicationKey,
              date: sale.date,
              enseigne: sale.enseigne,
              type: sale.type,
              agent: sale.agent,
              amountHT: sale.amountHT,
              amountTTC: sale.amountTTC,
              rate,
              commission,
              month,
              year,
            },
          });
        }
        insertedCount++;
        insertedDetails.push({
          bl: sale.blNumber,
          date: sale.date.toISOString().split('T')[0],
          enseigne: sale.enseigne,
          amountHT: sale.amountHT,
          agent: sale.agent,
          commission,
        });
      }
      console.log(`[migration/sebastien-gasnier] Inserted/updated ${insertedCount} sales`);

      // 5. Calcule le CA total des nouvelles ventes
      const totalInsertedCA = salesToInsert.reduce((s, v) => s + v.amountHT, 0);

      return {
        agent: { name: AGENT_NAME, created: agentCreated },
        deletedSales: deleteResult.count,
        deletedCA: totalDeletedCA,
        insertedSales: insertedCount,
        insertedCA: totalInsertedCA,
        enseignesCreated,
        details: insertedDetails,
      };
    });

    console.log(`[migration/sebastien-gasnier] Migration successful`);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Migration terminée : ${result.deletedSales} vente(s) supprimée(s), ${result.insertedSales} nouvelle(s) insérée(s). Agent ${result.agent.name} ${result.agent.created ? 'créé' : 'déjà existant'}.`,
    });
  } catch (e) {
    console.error('[migration/sebastien-gasnier] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur de migration' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Utilisez POST pour lancer la migration SEBASTIEN GASNIER',
    description: 'Supprime les ventes existantes attribuées à SEBASTIEN et insère les 3 nouvelles ventes (AUCHAN MANDELIEU ×2, AUCHAN GRASSE ×1) avec les bonnes données.',
    salesToInsert: [
      { bl: '26000623', date: '02/11/2026', enseigne: 'AUCHAN MANDELIEU', amountHT: 575.36, agent: 'SEBASTIEN GASNIER' },
      { bl: '26000435', date: '14/10/2026', enseigne: 'AUCHAN MANDELIEU', amountHT: 723.84, agent: 'SEBASTIEN GASNIER' },
      { bl: '26000381', date: '07/10/2026', enseigne: 'AUCHAN GRASSE', amountHT: 459.36, agent: 'SEBASTIEN GASNIER' },
    ],
  });
}
