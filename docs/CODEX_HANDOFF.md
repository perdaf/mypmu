# Passation Codex — MyPMU

Dernière mise à jour : 22 septembre 2026.

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
- La surveillance Quinté+ effectue une collecte complète au démarrage et au changement de journée, puis un suivi léger toutes les 15 minutes, accéléré à 5 minutes pendant les 30 dernières minutes et jusqu'aux résultats. Après les résultats, le watcher attend la prochaine journée sans créer de collectes vides. Les performances et la météo déjà stockées ne sont pas retéléchargées à chaque passage. Les exécutions interrompues depuis plus de 30 minutes sont automatiquement clôturées en échec au passage suivant.
- L'interface affiche l'état de la collecte, les dernières tentatives/réussites, les volumes, les erreurs et un conseil de vérification du VPN en cas d'indisponibilité PMU.
- L'écran « Historique & IA » distingue explicitement l'état du modèle probabiliste du seuil de 100 courses exploitables requis pour le premier backtest financier indicatif.

## Modèle probabiliste actuel

Le modèle historique suivant est conservé pour audit mais retiré de la production, car ses cotes et statistiques n'étaient pas toutes figées avant le départ :

- version : `logistic-v1-20260922122905063` ;
- 72 courses d'apprentissage ;
- 19 courses de validation chronologiquement postérieures ;
- erreur de Brier historique : `0,139`, contre `0,163` pour le modèle précédent ; cette mesure ne doit plus être présentée comme une validation temporelle fiable ;
- probabilités estimées séparément : victoire, Top 3, Top 4 et Top 5 ;
- 16 variables portant sur le marché, la carrière, la forme, la régularité, la discipline, la distance, l'hippodrome, la récupération et la qualité des données.

Le pipeline `logistic-v2` collecte désormais un instantané immuable de chaque partant et utilise uniquement les statistiques et cotes strictement antérieures au départ. Il ajoute le mouvement et la volatilité des cotes, le volume de relevés, la taille du peloton et la famille de discipline. Tant que 40 courses temporellement fiables ne sont pas disponibles et qu'un candidat ne bat pas le marché, les tickets reposent sur l'heuristique explicable sans influence du modèle historique.

La validation v2 mesure le Brier et la log-loss après la même normalisation que celle utilisée en production. Elle mesure aussi l'ordre d'arrivée : gagnant classé premier, rappel du Top 5, ordre exact du Top 5, exactitude des paires et NDCG@5. Les ex æquo utilisent les rangs PMU réels et leur ordre interne n'est pas arbitrairement pénalisé. Un candidat doit disposer d'au moins 15 courses de validation, battre le marché et ne pas dégrader ces métriques d'ordre pour être promu.

Après chaque collecte Quinté+, les exemples des courses encore à venir sont rafraîchis. Après 20 nouvelles courses v2 terminées, le besoin de réentraînement est contrôlé ; un minimum de 40 courses reste requis. Les prédictions rétroactives sont interdites.

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

- 38 tests réussis ;
- lint réussi ;
- vérification TypeScript réussie ;
- build Next.js réussi ;
- intégrité SQLite : `ok` ;
- base fusionnée sans perte avec `origin/main` : 97 courses, 5 389 relevés de cotes, 1 263 exécutions et 339 prédictions ;
- branche : `main`, avec arrêt des collectes vides après résultats et récupération automatique des exécutions interrompues.
