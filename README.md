# EgliseCollecte

Application hybride (web installable + Android via Capacitor) pour centraliser la gestion
des engagements financiers d'une église : souscriptions, encaissements par les percepteurs,
recouvrement par quartier, caisse, reçus numériques et audit complet.

Ce dépôt reprend le socle initial fourni et **complète tous les modules manquants** décrits
dans le cahier des charges : encaissement avec signature et reçu QR, caisse et clôtures,
recouvrement par quartier avec missions de visite, rapports exportables, gestion des
utilisateurs/rôles, journal d'audit consultable, paramètres, quartiers/groupes, et une file
hors-ligne (IndexedDB) avec synchronisation automatique.

## 1. Installation rapide

1. Créez un projet Supabase et notez son URL et sa clé **publiable (anon)**.
2. Copiez `.env.example` vers `.env.local` et renseignez ces deux valeurs.
3. Installez Node 20+, puis :
   ```bash
   npm install
   npm run dev
   ```
4. Avec la Supabase CLI liée à votre projet, appliquez les migrations dans l'ordre :
   ```bash
   supabase db push
   ```
   Les deux fichiers de `supabase/migrations/` doivent être appliqués l'un après l'autre
   (le second corrige et complète le premier — voir §5).
5. Créez le premier utilisateur dans **Supabase Auth**, puis donnez-lui un profil et une
   église depuis l'éditeur SQL :
   ```sql
   insert into church.churches(name) values ('Mon église') returning id;
   insert into church.profiles(id, church_id, full_name, role)
   values ('UUID_AUTH_UTILISATEUR', 'UUID_EGLISE', 'Administrateur principal', 'super_admin');
   insert into church.settings(church_id) values ('UUID_EGLISE');
   ```
6. Connectez-vous sur `/login` avec cet utilisateur.

## 2. Déploiement mobile (Android)

Le projet utilise Capacitor pour empaqueter le build web en application Android installable.

```bash
npm run build
npx cap add android   # une seule fois
npx cap sync android
npx cap open android  # ouvre Android Studio
```

Cette étape nécessite Android Studio / le SDK Android en local : elle n'a **pas** pu être
exécutée dans cet environnement (pas d'accès réseau ni d'outils natifs ici), mais
`capacitor.config.ts` et les dépendances `@capacitor/core`, `@capacitor/android`,
`@capacitor/cli` sont déjà en place.

## 3. Modules livrés (correspondance avec le cahier des charges)

| Écran prévu | Fichier | État |
|---|---|---|
| Connexion / mot de passe oublié | `src/pages/Login.tsx` | ✅ |
| Tableau de bord | `src/pages/Dashboard.tsx` | ✅ cartes + graphiques tabulaires + derniers encaissements |
| Membres (liste, fiche, création) | `src/pages/Members.tsx`, `MemberDetail.tsx` | ✅ recherche, création/édition, archivage, historique financier |
| Quartiers / groupes | `src/pages/Neighborhoods.tsx` | ✅ |
| Campagnes / souscriptions | `src/pages/Campaigns.tsx` | ✅ création de campagne, souscriptions par membre |
| Encaissement (parcours percepteur) | `src/pages/Payments.tsx` | ✅ recherche membre → souscription → montant/moyen/référence → signatures → reçu PDF+QR |
| Reçus (recherche, réimpression, annulation encadrée) | `src/pages/Receipts.tsx` | ✅ |
| Recouvrement par quartier + missions de visite | `src/pages/Recovery.tsx` | ✅ filtres + création de mission + suivi des visites |
| Caisse et clôture, remise au trésorier | `src/pages/CashSessions.tsx` | ✅ ouverture/clôture, remise, validation trésorier |
| Rapports exportables (CSV) | `src/pages/Reports.tsx` | ✅ 7 rapports clés du cahier des charges |
| Utilisateurs et rôles | `src/pages/Users.tsx` | ✅ changement de rôle, activation/désactivation |
| Audit | `src/pages/Audit.tsx` | ✅ lecture filtrable, non modifiable côté client |
| Paramètres | `src/pages/Settings.tsx` | ✅ validation obligatoire, dépassement, GPS |
| Vérification publique de reçu (QR) | `src/pages/VerifyReceipt.tsx` | ✅ route publique `/verify/:token`, aucune donnée sensible exposée |

## 4. Sécurité

- **Aucune clé `service_role`** dans le code : seule la clé publiable (anon) est utilisée
  côté client, protégée par RLS.
- Les mots de passe sont gérés uniquement par Supabase Auth.
- La création de comptes se fait volontairement **hors** de l'application cliente
  (Supabase Dashboard), pour ne jamais exposer de droits d'administration Auth au navigateur.
- Tous les calculs financiers (`paid_amount`, `balance`, `status`) sont recalculés **côté
  base de données** par trigger — jamais par le client.
- Les écritures financières (`payments`) passent exclusivement par des fonctions
  `SECURITY DEFINER` (`create_payment`, `validate_payment`, `request_void_payment`,
  `approve_void_payment`) : l'écriture directe sur la table est révoquée pour
  `anon`/`authenticated`.
- Une suppression de paiement n'existe pas : seule une **demande d'annulation validée**
  par un administrateur/trésorier est possible (`request_void_payment` /
  `approve_void_payment`), avec motif obligatoire.
- Chaque opération sensible (paiement, validation, annulation, ouverture/clôture de caisse,
  remise, changement de membre/campagne/souscription/profil) est journalisée automatiquement
  dans `audit_logs`, via triggers ou insertions explicites dans les fonctions RPC.
- Idempotence hors-ligne : chaque paiement porte un `client_id` (UUID généré sur l'appareil)
  unique par église ; rejouer la synchronisation ne crée jamais de doublon.
- Buckets Storage privés (`signatures`, `payment-proofs`, `member-photos`, `reports`) avec
  politiques par rôle ; un percepteur ne peut déposer que dans son propre dossier
  (`<uid>/...`).
- Le reçu imprimé porte un QR code pointant vers `/verify/:token`, qui n'expose que le
  numéro de reçu, le montant, la date et l'état — jamais les coordonnées du membre.

## 5. Base de données

`supabase/migrations/20260923100000_initial_schema.sql` est le schéma initial fourni.
**Il contenait une fonction `create_payment` syntaxiquement invalide** (instructions `if`
mal fermées) qui aurait empêché toute migration ou tout encaissement.
`supabase/migrations/20260923100001_extend_schema.sql` :

- corrige entièrement `create_payment` (et son idempotence, sa vérification de caisse
  ouverte, son calcul de dépassement) ;
- ajoute les tables manquantes du modèle de données prévu : `collector_assignments`,
  `collection_visits`, `cash_handover`, `attachments`, `notifications`, `settings` ;
- ajoute les fonctions RPC manquantes : `validate_payment`, `request_void_payment`,
  `approve_void_payment`, `open_cash_session`, `close_cash_session`,
  `record_cash_handover`, `validate_cash_handover`, `cancel_pledge`, `archive_member`,
  `verify_receipt` ;
- ajoute un trigger d'audit générique sur `members`, `campaigns`, `pledges`, `profiles` ;
- ajoute les politiques RLS d'**écriture** qui manquaient sur `members`, `campaigns`,
  `pledges`, `neighborhoods`, `church_groups`, `profiles` (le schéma initial ne permettait
  que la lecture, ce qui aurait empêché la création du moindre membre) ;
- crée les 4 buckets Storage privés et leurs politiques.

## 6. Limites connues à traiter avant une mise en production avec de l'argent réel

- **Icônes PWA** : `public/manifest.json` référence `icon-192.png` / `icon-512.png` qui ne
  sont pas fournis (génération d'images non disponible dans cet environnement) — ajoutez le
  logo de l'église dans `public/` avant publication.
- **Envoi SMS/WhatsApp** : la table `notifications` et le module Rapports sont prêts, mais
  aucune Edge Function d'envoi n'est branchée (choix du fournisseur à faire).
- **Build Android** : `npx cap add android` doit être exécuté sur un poste avec Android
  Studio/SDK installés (non disponible ici).
- **Tests automatisés** : `vitest`/`playwright` sont en dépendances mais aucun test n'a été
  écrit ; à prioriser sur les calculs de solde, les permissions RLS et l'idempotence
  hors-ligne avant mise en production.
- **`npm install` n'a pas pu être exécuté** dans cet environnement (pas d'accès réseau) —
  faites-le en premier sur votre poste pour vérifier la compilation (`npm run build`).

## 7. GitHub

```bash
git init
git add .
git commit -m "EgliseCollecte : socle + modules complets"
```

Ajoutez ensuite votre dépôt GitHub **privé** comme origine et poussez la branche principale.
Ne committez jamais `.env.local`.
