# Passation Codex — MyPMU

Dernière mise à jour : 4 septembre 2026.

## Objectif du produit

MyPMU est une aide expérimentale à la décision pour les courses hippiques, principalement le Quinté+. L'objectif n'est jamais de garantir un gain, mais de proposer plusieurs jeux complémentaires avec un budget maîtrisé : sécurité, couverture et potentiel de rapport. Les outsiders ne doivent être ni exclus systématiquement ni ajoutés au hasard.

## État opérationnel

- L'application Next.js affiche les programmes, les partants, les analyses et un constructeur de tickets modifiable.
- La liste des courses affiche sur le support Quinté+ le temps restant estimé avant la fermeture des paris et l'heure de départ en Martinique (`America/Martinique`). L'API ne donnant pas d'heure limite distincte, le départ sert de borne maximale et l'état `enVente` signale la fermeture réelle.
- Les formules, les Flexi 25/50/100 et leurs coûts sont recalculés dynamiquement.
- Les courses et paris fermés sont clairement signalés.
- SQLite est volontairement versionnée dans `data/mypmu.sqlite` pour partager l'historique entre les postes.
- Les chevaux, engagements et performances sont dédupliqués. Un cheval déjà connu enrichit sa fiche existante.
- Le collecteur récupère programme, partants, cotes, arrivées, rapports, jusqu'à dix performances antérieures et la météo disponible.
- `npm run dev:all` démarre l'application et la surveillance Quinté+ ensemble.
- La surveillance Quinté+ effectue une collecte complète au démarrage et au changement de journée, puis un suivi léger toutes les 15 minutes, accéléré à 5 minutes pendant les 30 dernières minutes et jusqu'aux résultats. Les performances et la météo déjà stockées ne sont pas retéléchargées à chaque passage.
- L'interface affiche l'état de la collecte, les dernières tentatives/réussites, les volumes, les erreurs et un conseil de vérification du VPN en cas d'indisponibilité PMU.

## Modèle probabiliste actuel

Le premier modèle versionné est actif :

- version : `logistic-v1-20260901172627915` ;
- 56 courses d'apprentissage ;
- 15 courses de validation chronologiquement postérieures ;
- erreur de Brier moyenne de référence : `0,163` ;
- probabilités estimées séparément : victoire, Top 3, Top 4 et Top 5 ;
- 16 variables portant sur le marché, la carrière, la forme, la régularité, la discipline, la distance, l'hippodrome, la récupération et la qualité des données.

Le modèle intervient au maximum à 35 % dans le score de recommandation et son poids diminue lorsque les données du cheval sont incomplètes. La partie heuristique explicable reste utilisée en complément.

Après chaque collecte Quinté+, les prédictions des courses encore à venir sont rafraîchies. Après 20 nouvelles courses terminées, un candidat est réentraîné. Il remplace le modèle actif uniquement s'il améliore d'au moins 0,5 % son erreur de Brier sur la même validation. Les prédictions rétroactives sont interdites.

Commandes utiles :

```bash
npm run dev:all
npm run model:train
npm run model:train:if-needed
```

## Prochaine étape prioritaire

Mettre en place le backtest financier chronologique des tickets :

1. figer pour chaque course les prédictions réellement produites avant le départ ;
2. simuler les jeux Simple, 2sur4, Multi et Quinté+ avec les rapports définitifs et les Flexi ;
3. mesurer mise totale, gains, perte maximale, retour sur mise, fréquence de gain et stabilité par type de jeu ;
4. comparer le modèle actif à des références simples : favoris du marché et heuristique historique ;
5. afficher ces résultats dans « Historique & IA » sans présenter une performance passée comme une garantie future ;
6. utiliser ensuite le backtest pour optimiser les propositions de tickets selon un budget choisi.

La météo et l'état de la piste devront être approfondis lorsque des données historiques suffisamment fiables seront disponibles. Ne pas ajouter une variable qui n'aurait pas été connue avant le départ de la course évaluée.

## Reprise sur un autre poste

```bash
git pull --rebase origin main
npm install
npm run dev:all
```

Ne jamais collecter simultanément sur deux postes. Avant de pousser une base modifiée, arrêter le collecteur puis exécuter :

```bash
sqlite3 data/mypmu.sqlite 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;'
```

Le résultat attendu est `ok`. Suivre ensuite les règles détaillées de `AGENTS.md`.

## Dernière validation connue

- 31 tests réussis ;
- lint réussi ;
- vérification TypeScript réussie ;
- build Next.js réussi ;
- intégrité SQLite : `ok` ;
- la base issue des collectes concurrentes des deux postes a été fusionnée sans perte : 77 courses, 1 562 relevés de cotes, 520 exécutions et 30 prédictions ;
- branche : `main`, incluant la collecte adaptative et le compte à rebours Quinté+.
