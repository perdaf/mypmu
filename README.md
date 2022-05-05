# app d'analyse des cheveaux pour le pmu

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
- [ ] récupérer le numéro de réunion (R1,2,...) et de course (C1,2,...) pour le pari **quinté+** en selectionnant la date de la course dans un **date picker**.
- [ ] récupérer la liste des cheveaux de la courses (mise en base de donnée ? sqlite ?).
- [ ] calculer la musique de chaque cheval.
- [ ] récupérer les pronostiques.
- [ ] calculer les statistique de chaque cheval.
- [ ] affiché les information sous forme de graph. 

---
nota:
- prendre les cheveaux un a un et "etudier" son poid dans les pronostics.

- Ne pas oublier d'intégrer dans le choix finale des outsider avec un 'system' random.