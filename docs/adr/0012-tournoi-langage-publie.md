# ADR-0012 - Le Tournoi lit le langage publié du Village et de la Forge par une projection, et ses combats se déduisent d'une graine enregistrée

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Tournoi organise des affrontements à élimination directe entre huit combattants : des
joueurs, et des chevaliers pilotés par l'ordinateur qui comblent les places vides. Pour s'y
inscrire, un joueur doit avoir porté chaque bâtiment de son village au niveau 5, et forgé au
moins deux pièces, soit le rang de compagnon de la Forge. Ses caractéristiques de combat
viennent de son village (défense, points de vie) et de son armurerie (attaque).

Le Tournoi doit donc connaître l'état de deux autres modules, sans les modifier ni dépendre de
leur code. Il doit aussi présenter des combats qui se déroulent sous les yeux des joueurs, tour
après tour, sans processus de fond (ADR 0004), et être testable.

Le Classement, enfin, doit présenter le nombre de tournois remportés par chaque joueur.

## Décision

**Lecture du langage publié.** Une projection propre au Tournoi (`tournament`, version 1) lit
dans le journal les événements `VillageFounded` et `BuildingUpgraded` du Village, et
`ItemCollected` de la Forge, et tient le profil de chaque joueur dans la table
`tournament.champions`. Le Tournoi n'importe du Village et de la Forge que leurs contrats
(préfixes des flux, niveaux de départ, puissance des recettes). Le Village exporte pour cela
une constante de plus dans ses contrats : `STARTING_LEVELS`.

**Inscriptions dans le journal.** Un tournoi est un agrégat du journal (`tournament-<id>`) :
`TournamentOpened`, `EntrantJoined`, `TournamentStarted`, `PrizesAwarded`. Les caractéristiques
d'un joueur sont figées à son inscription, dans l'événement : le combat ne dépend que du journal.

**Combats déterministes.** Au lancement, `TournamentStarted` enregistre une graine et les
chevaliers tirés au sort. Les combats ne sont pas des événements : le tableau complet (tirage des
places, sept duels coup par coup) se déduit de la graine et des inscrits, par des fonctions pures
(`domain/combat.ts`, `domain/random.ts`). Les chevaliers suivent un profil et une tactique fixés ;
leurs caractéristiques ont été réglées par simulation.

**Tours à échéance paresseuse.** Chaque tour dure trente secondes. La vue calcule à la lecture le
tour en cours, masque l'issue des duels du tour en cours, et dévoile les vainqueurs à l'échéance.

**Récompenses par la boîte d'envoi.** Le lancement programme un message différé
(`tournament.award`) à la fin du dernier tour. Son gestionnaire enregistre `PrizesAwarded`, puis
demande au Village le versement de 50 pièces d'or au champion et de 20 au finaliste, s'ils sont
des joueurs (`realm.deposit`, clés `tournament:<id>:champion` et `tournament:<id>:finalist`).

**Liste des tournois.** La liste ne présente que les tournois ouverts et ceux dont le dernier
tour n'est pas terminé. Une tâche quotidienne propre au Tournoi, exécutée par la route
`/api/cron/daily`, retire de la table `tournament.tournaments` les tournois terminés depuis plus
de vingt-quatre heures ; un tournoi reste consultable par son adresse, à partir du journal.

**Évolution du Classement.** La projection du Classement lit `PrizesAwarded` et compte les
tournois remportés par chaque joueur. C'est une modification d'un module existant : sa
projection passe en version 3 et est reconstruite, et une migration de son propre schéma
(`ranking`) ajoute la colonne `tournaments_won`. Elle est consignée ici, comme le demande la
règle des modifications minimales de l'existant.

## Conséquences

### Positives

- Le Village et la Forge ne connaissent pas le Tournoi : il les lit comme le Classement les lit
  depuis le TD8. Au déploiement, la projection se construit à partir de tout le journal : les
  progrès passés des joueurs sont pris en compte.
- Un tournoi est rejouable à l'identique à partir de sa graine : chaque règle du combat est
  vérifiée par des tests déterministes, et l'équilibre a pu être mesuré par simulation.
- Le journal ne contient que quatre événements par tournoi, quel que soit le nombre de coups.
- Les récompenses réutilisent la boîte d'envoi et l'idempotence du Village : un tournoi n'est
  jamais récompensé deux fois.

### Négatives

- Le profil d'un joueur est un modèle de lecture différé : une amélioration toute récente peut
  n'être prise en compte qu'à la lecture suivante.
- Le Tournoi dépend du nom et des données de trois événements d'autres modules : les renommer
  romprait sa projection sans erreur de compilation.
- Le tableau est recalculé à chaque lecture, et un joueur peut s'inscrire à plusieurs tournois à
  la fois (dettes techniques consignées).
- La liste des tournois est un modèle de lecture que la tâche quotidienne purge des tournois
  terminés : une reconstruction de la projection les y rétablit jusqu'à la tâche suivante.
- La modification du Classement crée une dépendance de plus entre modules, et sa reconstruction
  relit tout le journal au premier déploiement.
- Les caractéristiques des chevaliers sont figées : un joueur très avancé gagne presque toujours.

## Alternatives écartées

- **Demander l'état du village et de la forge par des messages** : une saga pour une simple
  lecture, avec une réponse asynchrone au moment de l'inscription.
- **Enregistrer chaque coup comme un événement** : des dizaines d'événements par tournoi, sans
  information de plus que la graine.
- **Résoudre les tours par une tâche de fond** : impossible sur l'hébergement retenu (ADR 0004).
- **Compter les tournois dans le Tournoi lui-même, et l'afficher dans sa page** : le Classement
  est le seul endroit où les joueurs comparent leurs résultats.
- **Tirer les combats au hasard à chaque lecture** : deux joueurs verraient des tableaux
  différents, et aucun test ne pourrait vérifier un résultat.

## Réexamen

Cette décision devra être réexaminée si le nombre de lectures rend le recalcul du tableau
coûteux (enregistrer le tableau au lancement), si les joueurs doivent agir pendant un duel (le
combat ne pourrait plus se déduire de la seule graine), ou si un module dont le Tournoi lit les
événements change leur forme.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition de la conception du Tournoi, du réglage des chevaliers par
simulation, et d'une première rédaction de cet ADR. Les règles décrites sont vérifiées par les
tests du domaine (`tournament.test.ts`), de la projection du Classement et de l'API
(`tournament-api.test.ts`) ; le texte a été relu et validé avant d'être versionné.
