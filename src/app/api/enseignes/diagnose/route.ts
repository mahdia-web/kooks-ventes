import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

/**
 * GET /api/enseignes/diagnose?name=SCAOUEST
 *
 * Diagnostic complet d'une enseigne (par nom ou partie du nom).
 * Utile pour comprendre pourquoi une enseigne apparaît mal dans le dashboard.
 *
 * Retourne :
 *   - L'enseigne elle-même (type, agent, commissionRate, isActive)
 *   - Toutes les enseignes dont le nom normalisé contient le terme recherché
 *     (pour identifier les magasins non liés à la coopérative)
 *   - Toutes les ventes de cette enseigne (groupées par agent et par type)
 *   - Le nombre de ventes par agent
 *   - Le CA total par type (Direct vs Centrale)
 *
 * Si ?name=SCAOUEST, cherche aussi les magasins physiques membres
 * (ex: "LECLERC SCAOUEST (...)") qui devraient peut-être être liés.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('name') ?? '';

    if (!query.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Paramètre name requis' },
        { status: 400 }
      );
    }

    const searchTerm = query.trim();
    const searchTermUpper = searchTerm.toUpperCase();
    const searchTermNorm = normalizeEnseigne(searchTerm);

    // 1. Cherche l'enseigne exacte
    const exactMatch = await db.enseigne.findUnique({
      where: { name: searchTerm },
    });

    // 2. Cherche toutes les enseignes dont le nom contient le terme (insensible casse)
    const relatedEnseignes = await db.enseigne.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          // Cherche aussi par forme normalisée
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        agent: true,
        commissionRate: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    // 3. Pour chaque enseigne apparentée, récupère le nombre de ventes et le CA
    const relatedWithStats = await Promise.all(
      relatedEnseignes.map(async (e) => {
        const salesAgg = await db.sale.groupBy({
          by: ['type', 'agent'],
          where: { enseigne: e.name },
          _count: { _all: true },
          _sum: { amountHT: true, commission: true },
        });
        const totalSales = salesAgg.reduce((s, a) => s + a._count._all, 0);
        const totalCA = salesAgg.reduce((s, a) => s + (a._sum.amountHT ?? 0), 0);
        const byAgent = new Map<string, { count: number; ca: number; type: string }>();
        for (const a of salesAgg) {
          const key = `${a.agent} (${a.type})`;
          const existing = byAgent.get(key) ?? { count: 0, ca: 0, type: a.type };
          existing.count += a._count._all;
          existing.ca += a._sum.amountHT ?? 0;
          byAgent.set(key, existing);
        }
        return {
          ...e,
          normalized: normalizeEnseigne(e.name),
          totalSales,
          totalCA,
          byAgent: Array.from(byAgent.entries()).map(([key, v]) => ({
            agent_type: key,
            count: v.count,
            ca: v.ca,
          })),
        };
      })
    );

    // 4. Si l'enseigne exacte existe, récupère un échantillon de ses ventes
    let recentSales: any[] = [];
    let salesByAgent: Array<{ agent: string; type: string; count: number; ca: number }> = [];
    let salesByType: Array<{ type: string; count: number; ca: number }> = [];
    if (exactMatch) {
      const sales = await db.sale.findMany({
        where: { enseigne: exactMatch.name },
        select: {
          id: true, blNumber: true, date: true, enseigne: true,
          type: true, agent: true, amountHT: true, commission: true,
          month: true, year: true,
        },
        orderBy: { date: 'desc' },
        take: 20,
      });
      recentSales = sales;

      // Agrégation par agent
      const aggByAgent = await db.sale.groupBy({
        by: ['agent', 'type'],
        where: { enseigne: exactMatch.name },
        _count: { _all: true },
        _sum: { amountHT: true },
      });
      salesByAgent = aggByAgent.map((a) => ({
        agent: a.agent,
        type: a.type,
        count: a._count._all,
        ca: a._sum.amountHT ?? 0,
      }));

      // Agrégation par type
      const aggByType = await db.sale.groupBy({
        by: ['type'],
        where: { enseigne: exactMatch.name },
        _count: { _all: true },
        _sum: { amountHT: true },
      });
      salesByType = aggByType.map((a) => ({
        type: a.type,
        count: a._count._all,
        ca: a._sum.amountHT ?? 0,
      }));
    }

    // 5. Analyse : identifie les problèmes potentiels
    const issues: string[] = [];
    if (exactMatch) {
      // SCAOUEST est une coopérative — devrait être type "Centrale"
      const isCoopName = ['SCAOUEST', 'SCAPEST', 'SCACHAP', 'ALDOUEST', 'OTERA', 'SCADIF', 'SCAPNOR', 'SCAPDR', 'SCARA'].some(
        (coop) => exactMatch.name.toUpperCase().includes(coop)
      );
      if (isCoopName && exactMatch.type !== 'Centrale') {
        issues.push(`⚠ "${exactMatch.name}" est une coopérative mais est typée "${exactMatch.type}" au lieu de "Centrale"`);
      }
      // Vérifier la cohérence des types de ventes
      const hasMixedTypes = salesByType.length > 1;
      if (hasMixedTypes && isCoopName) {
        issues.push(`⚠ Les ventes de "${exactMatch.name}" ont des types mixtes: ${salesByType.map((t) => `${t.type} (${t.count})`).join(', ')}. Une coopérative devrait avoir toutes ses ventes en "Centrale".`);
      }
      // Vérifier s'il y a plusieurs agents
      if (salesByAgent.length > 1) {
        issues.push(`ℹ "${exactMatch.name}" a des ventes réparties sur ${salesByAgent.length} agents: ${salesByAgent.map((a) => `${a.agent} (${a.count} BL, ${a.ca.toFixed(0)}€)`).join(', ')}`);
      }
    } else {
      issues.push(`⚠ Aucune enseigne avec le nom exact "${searchTerm}" n'existe en base`);
    }

    // Vérifie s'il y a des magasins physiques (avec préfixe LECLERC, SUPER U, etc.)
    // qui contiennent le terme de recherche — ce sont des membres potentiels
    const physicalStores = relatedWithStats.filter((e) =>
      /^(LECLERC|SUPER U|HYPER U|INTERMARCHE|CARREFOUR|AUCHAN|CORA)/i.test(e.name) &&
      e.name !== searchTerm
    );
    if (physicalStores.length > 0) {
      issues.push(`ℹ ${physicalStores.length} magasin(s) physique(s) trouvé(s) avec "${searchTerm}" dans le nom — possiblement des membres de la coopérative non liés:`);
      for (const s of physicalStores) {
        issues.push(`   • ${s.name} (type=${s.type}, agent=${s.agent}, ${s.totalSales} ventes, ${s.totalCA.toFixed(0)}€)`);
      }
    }

    return NextResponse.json({
      ok: true,
      query: searchTerm,
      exactMatch,
      relatedEnseignes: relatedWithStats,
      recentSales,
      salesByAgent,
      salesByType,
      issues,
      physicalStores,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[diagnose] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * POST /api/enseignes/diagnose
 * Body: { action: "fix_type" | "fix_agent" | "fix_sales_type", name: string, newType?: string, newAgent?: string }
 *
 * Actions de correction :
 *   - fix_type: change le type de l'enseigne (ex: Direct → Centrale)
 *     + propage aux ventes existantes (type, rate, commission recalculée)
 *   - fix_agent: change l'agent de l'enseigne
 *     + propage aux ventes existantes
 *   - fix_sales_type: re-type toutes les ventes d'une enseigne
 *     (utile si une coopérative a des ventes en "Direct" qui devraient être "Centrale")
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, name, newType, newAgent } = body as {
      action: 'fix_type' | 'fix_agent' | 'fix_sales_type';
      name: string;
      newType?: 'Direct' | 'Centrale' | 'CHR';
      newAgent?: string;
    };

    if (!action || !name) {
      return NextResponse.json(
        { ok: false, error: 'action et name requis' },
        { status: 400 }
      );
    }

    const existing = await db.enseigne.findUnique({ where: { name } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `Enseigne "${name}" introuvable` },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      if (action === 'fix_type') {
        if (!newType || !['Direct', 'Centrale', 'CHR'].includes(newType)) {
          throw new Error('newType doit être Direct, Centrale ou CHR');
        }
        // Calcule le nouveau taux
        const newRate = newType === 'CHR' ? 0 : newType === 'Centrale' ? 0.05 : 0.07;

        // Met à jour l'enseigne
        await tx.enseigne.update({
          where: { id: existing.id },
          data: { type: newType, lastManualUpdate: new Date() },
        });

        // Met à jour toutes les ventes (type + rate + commission)
        const salesResult = await tx.sale.updateMany({
          where: { enseigne: name },
          data: { type: newType, rate: newRate },
        });

        // Recalcule commission pour chaque vente (amountHT × rate)
        const sales = await tx.sale.findMany({
          where: { enseigne: name },
          select: { id: true, amountHT: true },
        });
        for (const s of sales) {
          await tx.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * newRate },
          });
        }

        return {
          action: 'fix_type',
          oldType: existing.type,
          newType,
          newRate,
          salesUpdated: salesResult.count,
        };
      }

      if (action === 'fix_agent') {
        if (!newAgent) {
          throw new Error('newAgent requis pour fix_agent');
        }
        // Met à jour l'enseigne
        await tx.enseigne.update({
          where: { id: existing.id },
          data: { agent: newAgent, lastManualUpdate: new Date() },
        });

        // Met à jour toutes les ventes
        const salesResult = await tx.sale.updateMany({
          where: { enseigne: name },
          data: { agent: newAgent },
        });

        return {
          action: 'fix_agent',
          oldAgent: existing.agent,
          newAgent,
          salesUpdated: salesResult.count,
        };
      }

      if (action === 'fix_sales_type') {
        if (!newType || !['Direct', 'Centrale', 'CHR'].includes(newType)) {
          throw new Error('newType doit être Direct, Centrale ou CHR');
        }
        const newRate = newType === 'CHR' ? 0 : newType === 'Centrale' ? 0.05 : 0.07;

        // Met à jour le type des ventes SANS changer le type de l'enseigne
        // (utile si l'enseigne est déjà Centrale mais a des ventes en Direct)
        const salesResult = await tx.sale.updateMany({
          where: { enseigne: name },
          data: { type: newType, rate: newRate },
        });

        // Recalcule commission
        const sales = await tx.sale.findMany({
          where: { enseigne: name },
          select: { id: true, amountHT: true },
        });
        for (const s of sales) {
          await tx.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * newRate },
          });
        }

        // Met aussi à jour l'enseigne
        await tx.enseigne.update({
          where: { id: existing.id },
          data: { type: newType, lastManualUpdate: new Date() },
        });

        return {
          action: 'fix_sales_type',
          newType,
          newRate,
          salesUpdated: salesResult.count,
        };
      }

      throw new Error(`Action inconnue: ${action}`);
    });

    return NextResponse.json({
      ok: true,
      ...result,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[diagnose] POST error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
