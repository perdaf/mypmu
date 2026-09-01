# MyPMU Analytique

Application moderne d’aide à la lecture et à l’analyse des courses hippiques à partir des données PMU.

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Vérifications

```bash
npm run lint
npm run typecheck
npm run build
```

## Architecture

- `app/` : routes et interface Next.js App Router ;
- `components/` : composants interactifs ;
- `lib/pmu.ts` : accès centralisé et validation des réponses PMU avec Zod ;
- `lib/date.ts` : conversion et validation des dates.
- `lib/bets.ts` : calcul des combinaisons, de la couverture et des coûts Flexi ;
- `components/bet-simulator.tsx` : simulateur des formules réellement ouvertes sur une course.

Le simulateur exploite `miseBase`, `valeursFlexiAutorisees` et `valeursRisqueAutorisees` fournis par PMU. Il ne présente pas encore ses calculs comme des recommandations : il faudra d’abord collecter les cotes avant départ, les arrivées et les rapports définitifs, puis mesurer les stratégies sur un historique strictement antérieur à chaque course.

## Recommandation expérimentale

La fiche course génère automatiquement un classement explicable à partir de la cote, de la musique récente, du bilan de carrière, du consensus des pronostiqueurs et de l’avis de l’entraîneur. Elle préremplit trois jeux complémentaires : sécurité, couverture et objectif Quinté+. Un outsider n’est retenu que lorsque ses indicateurs sportifs et son soutien dépassent ce que suggère sa cote ; il n’est jamais ajouté au hasard.

Ce classement est une première heuristique transparente. Il devra être remplacé ou recalibré après collecte historique et backtest chronologique avant d’afficher des probabilités de gain.

## Base historique

Le stockage local SQLite est initialisé puis alimenté avec :

```bash
npm run db:init
npm run collect -- JJMMAAAA
# Une seule course :
npm run collect -- JJMMAAAA REUNION COURSE
```

Automatisation du jour PMU (fuseau Europe/Paris) :

```bash
# Collecte complète quotidienne
npm run collect:today

# Surveillance toutes les 5 minutes des courses à ±45 minutes du départ
npm run collect:watch

# Compléter la météo des courses déjà présentes, même si PMU est indisponible
npm run collect:weather -- JJMMAAAA
```

Rattrapage historique, avec reprise automatique par journée :

```bash
npm run collect:history -- 01012026 31082026

# Vérifier le plan sans appeler les sources
npm run collect:history -- 01012026 31012026 --dry-run

# Refaire aussi les journées déjà terminées
npm run collect:history -- 01012026 31012026 --force
```

Le rattrapage effectue deux tentatives par journée, attend deux secondes entre les journées et impose au collecteur PMU un délai minimal de 500 ms entre requêtes. Les options `--attempts=`, `--delay-ms=` et la variable `MYPMU_REQUEST_DELAY_MS` permettent d’ajuster ces limites. Un `Ctrl+C` marque la journée courante comme `pending`; la prochaine exécution la reprendra. La plage est volontairement limitée à 366 jours par lancement.

La page `/historique` affiche les sources configurées, les journées terminées ou échouées et les dernières erreurs d’ingestion. Le collecteur utilise actuellement PMU pour les données hippiques, OpenStreetMap pour les coordonnées et Open-Meteo pour les conditions horaires. Turf.bzh reste déclaré comme fournisseur secondaire optionnel mais désactivé tant qu’aucune clé personnelle n’est fournie ; aucune clé ne doit être ajoutée au dépôt.

L’intervalle peut être réglé avec `MYPMU_COLLECTION_INTERVAL_MS`, sans descendre sous une minute. Une exécution complète quotidienne prépare le programme ; la surveillance conserve ensuite les mouvements de cote proches du départ et récupère les résultats/rapports lorsqu’ils deviennent disponibles.

La base `data/mypmu.sqlite` est versionnée afin de partager le même historique entre les postes de développement. Son schéma se trouve dans `data/schema.sql`. La collecte est relançable : courses, chevaux et partants sont mis à jour sans doublon, tandis que chaque nouvelle cote est conservée comme un instantané daté.

### Synchroniser la base entre deux postes

SQLite est un fichier binaire que Git ne peut pas fusionner. Il ne faut donc pas collecter sur les deux postes en parallèle :

```bash
# Avant de commencer à travailler ou à collecter
git pull --rebase origin main

# Après la collecte, une fois le collecteur arrêté
sqlite3 data/mypmu.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);'
git add data/mypmu.sqlite
git commit -m "data: update PMU history"
git push origin main
```

Les fichiers temporaires `data/*.sqlite-wal` et `data/*.sqlite-shm` restent ignorés. Pour une collecte continue ou une base devenue volumineuse, il faudra migrer cet historique vers un stockage partagé plutôt que conserver SQLite dans Git.

Les champs absents sont enregistrés dans `race_entries.missing_fields` avec un indice `data_completeness`. Dans l’analyse, une donnée manquante reçoit une valeur neutre, jamais zéro : le cheval reste étudié, mais la confiance et, légèrement, le score sont réduits. Si plus de 40 % des partants ont une confiance faible, ou si la complétude moyenne descend sous 55 %, le moteur s’abstient déjà de proposer un ticket.

Le collecteur récupère aussi jusqu’à dix performances détaillées antérieures pour chaque partant. Les événements sont normalisés dans `horse_performances` et reliés à la course cible par `race_entry_performance_snapshots`. Seules les performances dont la date précède strictement le départ sont conservées dans cet instantané, afin d’empêcher toute fuite de données futures pendant l’entraînement et les backtests.

La fiche course transforme cet historique en indicateurs de forme, régularité, aptitude à la discipline, à la distance et à l’hippodrome, risque de disqualification, récupération et tendance. Une influence limitée de 15 % est appliquée au classement uniquement à partir de trois sorties antérieures. Si l’API détaillée ne répond pas, l’application reprend automatiquement l’instantané SQLite de la course.

La météo horaire est fournie par Open-Meteo après géocodage précis et mis en cache via OpenStreetMap Nominatim, puis stockée dans `race_weather` avec sa source. Elle décrit les conditions atmosphériques proches du départ, mais ne remplace jamais l’état officiel du terrain ou de la piste. L’accès PMU essaie successivement les passerelles `online` et `offline`; la liste peut être remplacée avec `MYPMU_PMU_API_ROOTS` (URLs séparées par des virgules).

Le projet ne fournit pas de garantie de gain. Les futures probabilités devront être calculées à partir de données historiques et évaluées par backtest chronologique.

## Historique du prototype

### API

details courses:
- URL de requête: https://online.turfinfo.api.pmu.fr/rest/client/62/programme/03052022?meteo=true&specialisation=OFFLINE


infos sur les participants:
- https://online.turfinfo.api.pmu.fr/rest/client/62/programme/30032022/R1/C1/participants?specialisation=OFFLINE

pronostics:
- https://online.turfinfo.api.pmu.fr/rest/client/62/programme/16042022/R1/C3/pronostics?commentaire=true

pronostics détaillés:
- https://online.turfinfo.api.pmu.fr/rest/client/62/programme/16042022/R1/C3/pronostics-detailles

???:
- https://online.turfinfo.api.pmu.fr/rest/client/62/programme/16042022/R1?specialisation=OFFLINE

structure de l'API

root: 
- https://online.turfinfo.api.pmu.fr/rest/client/62/programme/

---

**TODO :**
- [X] créer un 'date picker' sur la page d'acceuil pour séléctionner la date de la course.
- [X] récupérer le numéro de réunion (R1,2,...) et de course (C1,2,...) pour le pari **quinté+** en selectionnant la date de la course dans un **date picker**.
    - [ ] (10/05/22) mettre en forme la liste des reunion et les paris/courses associé.
- [ ] récupérer la liste des cheveaux de la courses (mise en base de donnée ? sqlite ?).
- [ ] calculer la musique de chaque cheval.
- [ ] récupérer les pronostiques.
- [ ] calculer les statistique de chaque cheval.
- [ ] affiché les information sous forme de graph. 

---
nota:
- prendre les cheveaux un a un et "etudier" son poid dans les pronostics.

- Ne pas oublier d'intégrer dans le choix finale des outsider avec un 'system' random.
