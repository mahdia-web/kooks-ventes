# Guide de déploiement : Vercel + Supabase

## Étape 1 : Créer un compte Supabase (gratuit)

1. Allez sur https://supabase.com
2. Cliquez "Start your project" → inscrivez-vous avec GitHub
3. Cliquez "New Project"
4. Nommez-le (ex: "kooks-ventes")
5. Choisissez une région proche (Europe/Ouest)
6. Générez un mot de passe fort pour la base
7. Cliquez "Create new project"
8. Attendez 2 minutes que le projet soit prêt

## Étape 2 : Récupérer l'URL de connexion

1. Dans Supabase, allez dans "Project Settings" → "Database"
2. Cherchez "Connection string" → "URI"
3. Copiez l'URL qui ressemble à :
   ```
   postgresql://postgres.[votre-id]:[mot-de-passe]@aws-0-eu-west-3.pooler.supabase.com:6543/postgres
   ```

## Étape 3 : Pousser le code sur GitHub

Le code doit être sur GitHub pour que Vercel le déploie :
1. Créez un repo sur GitHub (ex: "kooks-ventes-dashboard")
2. Poussez le code du projet

## Étape 4 : Déployer sur Vercel

1. Allez sur https://vercel.com → inscrivez-vous avec GitHub
2. "Add New Project" → sélectionnez votre repo
3. Dans "Environment Variables", ajoutez :
   - Name: `DATABASE_URL`
   - Value: [votre URL Supabase de l'étape 2]
4. Framework preset: Next.js (auto-détecté)
5. Cliquez "Deploy"
6. Attendez 2-3 minutes → votre app est en ligne sur https://[projet].vercel.app

## Étape 5 : Initialiser la base de données

Après le premier déploiement, allez dans Vercel → votre projet → "Storage" → ou ouvrez un terminal :
```bash
npx prisma db push
npx tsx scripts/seed-db.ts
```

## Avantages de Vercel + Supabase

✅ **Zéro crash** — Vercel gère le serveur automatiquement
✅ **Données persistantes** — Supabase PostgreSQL ne perd jamais de données
✅ **Accès 24/7** — disponible à tout moment
✅ **HTTPS automatique** — sécurité incluse
✅ **Gratuit** — Vercel (plan gratuit) + Supabase (500MB gratuit)
✅ **Mises à jour sans perte** — quand vous redeploiez, les données restent
