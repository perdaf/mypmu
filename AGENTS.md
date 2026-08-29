# Instructions pour les agents Codex

Ces règles s'appliquent à tout le dépôt MyPMU, quel que soit le poste de développement utilisé.

## Base SQLite partagée

- `data/mypmu.sqlite` est volontairement versionnée dans Git. Elle contient l'historique utilisé pour les analyses et, à terme, l'entraînement des modèles.
- Les fichiers temporaires `data/*.sqlite-wal` et `data/*.sqlite-shm` ne doivent jamais être ajoutés à Git.
- SQLite étant un fichier binaire, Git ne peut pas fusionner deux versions concurrentes de la base.
- Ne jamais lancer la collecte simultanément sur deux postes.
- Avant toute collecte ou modification de la base, vérifier que l'arbre de travail est propre puis synchroniser la branche :

  ```bash
  git status --short --branch
  git pull --rebase origin main
  ```

- Ne pas lancer automatiquement un `pull --rebase` si des changements locaux non commités sont présents. Les signaler et les préserver.
- Avant de committer la base, arrêter tout collecteur, forcer l'intégration du WAL et vérifier l'intégrité :

  ```bash
  sqlite3 data/mypmu.sqlite 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;'
  ```

- Le résultat attendu du contrôle d'intégrité est `ok`. Ne pas committer une base qui échoue à ce contrôle.
- Après une collecte réussie, inclure `data/mypmu.sqlite` dans le commit et pousser la branche afin que l'autre poste récupère le même historique :

  ```bash
  git add data/mypmu.sqlite
  git commit -m "data: update PMU history"
  git push origin main
  ```

- Si la branche distante et la branche locale contiennent chacune une version différente de la base, ne choisir ni écraser une version sans examen. Conserver les deux fichiers, signaler le conflit et fusionner leurs données avec un script ou une migration SQL contrôlée.

## Vérifications du projet

- Utiliser `npm install` après toute modification de `package.json` ou `package-lock.json` récupérée depuis Git.
- Avant de pousser une modification applicative, exécuter autant que possible :

  ```bash
  npm test
  npm run lint
  npm run typecheck
  npm run build
  ```

- Ne jamais présenter les recommandations de jeu comme une garantie de gain. Les scores et probabilités doivent rester explicables, être évalués chronologiquement et traiter explicitement les données manquantes.
