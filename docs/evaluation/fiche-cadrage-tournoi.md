# Fiche de cadrage : le Tournoi

- Auteur : Mathis Cornuault
- Date : 2026-10-23
- Nom technique du module : `tournament`

## L'idée

Les joueurs dont le village et la forge sont assez avancés s'affrontent dans des tournois à
élimination directe de huit places : quarts de finale, demi-finales, finale. Un joueur ouvre un
tournoi, d'autres joueurs le rejoignent, et les places vides sont prises au lancement par des
chevaliers pilotés par l'ordinateur. Les duels se déroulent sous les yeux des joueurs, coup par
coup, dans une arène, et les vainqueurs avancent sur les branches du tableau jusqu'au champion,
qui reçoit une récompense en or. Le Tournoi donne un but aux progrès faits au Village et à la
Forge, et un enjeu commun entre joueurs.

## Les règles métier

1. Seuls les joueurs dont chaque bâtiment du village (scierie, carrière, mine) est au moins au
   niveau 5, et qui ont forgé au moins 2 pièces (rang de compagnon), s'inscrivent ; leurs
   caractéristiques de combat (attaque tirée de l'armurerie, défense et points de vie tirés du
   village) sont figées à l'inscription.
2. On ne rejoint qu'un tournoi ouvert, une seule fois, dans la limite de huit places.
3. Seul l'hôte lance le tournoi ; les places vides sont alors prises par des chevaliers pilotés
   par l'ordinateur, tirés au sort.
4. Les dégâts d'un coup dépendent de l'attaque, d'un dé, de la défense adverse, et du triangle
   des tactiques choisies à l'inscription (offensive, équilibrée, défensive).
5. Le tableau à élimination directe se déduit d'une graine tirée au lancement : la même graine
   donne toujours le même tournoi.
6. Chaque tour dure trente secondes, et se dévoile à son échéance : l'issue d'un duel n'est
   connue qu'à la fin de son tour.
7. Le champion et le finaliste, s'ils sont des joueurs, reçoivent 50 et 20 pièces d'or dans leur
   village, une seule fois, après la finale.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir ses conditions d'entrée et son combattant | Lecture | `GET /api/tournament/eligibility` |
| Voir les tournois ouverts et en cours | Lecture | `GET /api/tournament/tournaments` |
| Ouvrir un tournoi, avec une tactique | Commande `OpenTournament` | `POST /api/tournament/tournaments` |
| Suivre un tournoi : inscrits, arène, tableau | Lecture | `GET /api/tournament/tournaments/:id` |
| Rejoindre un tournoi ouvert, avec une tactique | Commande `JoinTournament` | `POST /api/tournament/tournaments/:id/join` |
| Lancer son tournoi | Commande `StartTournament` | `POST /api/tournament/tournaments/:id/start` |

## Le stockage envisagé

Journal d'événements pour les tournois (flux `tournament-<id>` : ouverture, inscriptions,
lancement avec la graine, récompenses) : les combats ne sont pas enregistrés, ils se déduisent de
la graine. Tables classiques dans le schéma `tournament` pour les modèles de lecture tenus par
une projection : profil de combattant de chaque joueur, et liste des tournois.

## La communication avec les modules existants

- Village et Forge : lecture de leur langage publié par la projection du Tournoi
  (`VillageFounded`, `BuildingUpgraded`, `ItemCollected`), pour établir le profil des joueurs.
- Village : versement des récompenses par la boîte d'envoi (`realm.deposit`).
- Classement : il lit l'événement `PrizesAwarded` du Tournoi pour compter les tournois remportés.

## Les données personnelles

Le nom des joueurs inscrits (et de l'hôte), dans les événements et la liste des tournois, et le
profil de combattant de chaque joueur : exportés, puis remplacés ou supprimés à la suppression
du compte.

## Les bonus visés

1. B3 - Personnages pilotés par l'ordinateur, selon une IA déterministe et testée.
2. B4 - Modèle de lecture tenu par une projection, avec point de reprise et version.
3. B6 - Communication avec au moins deux modules existants (Village, Forge, Classement).
4. B2 - Échéance gérée sans tâche de fond : le dévoilement des tours.
5. B1 - Canal temps réel propre au module.
