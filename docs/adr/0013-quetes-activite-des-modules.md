# ADR-0013 - Les Quêtes du jour lisent l'activité des autres modules dans leur langage publié, et celle de la Taverne par son point d'entrée

- Statut : accepté
- Date : 2026-10-23

## Contexte

Les Quêtes du jour proposent chaque jour à chaque joueur trois objectifs, tirés parmi des
actions des autres modules : améliorer un bâtiment, forger une pièce, terminer ou remporter une
expédition, participer à un tournoi ou le remporter, publier une offre, écrire à la Taverne.
Une quête accomplie se coche d'elle-même, et sa récompense en or est versée au village.

Le module doit donc connaître, jour par jour, l'activité de chaque joueur dans six modules,
sans modifier ni dépendre de leur code. Cinq d'entre eux enregistrent leurs actions dans le
journal d'événements ; la Taverne, elle, n'enregistre pas d'événements : ses messages sont des
lignes de sa table (ADR 0008).

Le tableau des quêtes est affiché en permanence à droite de chaque écran du jeu : il doit se
mettre à jour dès que le joueur agit, quel que soit l'écran où il se trouve.

## Décision

**Activité des modules à événements.** Une projection propre aux Quêtes (`quests`, version 1)
lit les événements `BuildingUpgraded`, `ItemCollected`, `GameEnded`, `TournamentOpened`,
`EntrantJoined`, `PrizesAwarded` et `OfferPublished`, et compte dans la table `quests.activity`
l'activité de chaque joueur par jour, d'après l'instant de l'action enregistré dans l'événement.
Elle retient aussi les joueurs qui ont fondé un village (`VillageFounded`).

**Activité de la Taverne.** La Taverne expose par son point d'entrée public une lecture,
`activity.messagesSince(joueur, instant)`, fondée sur une requête qu'elle possédait déjà ; la
racine de composition la transmet aux Quêtes, qui la déclarent comme un port (`TavernActivity`).
C'est la seule modification d'un module existant.

**Tirage déterministe.** Les trois quêtes du jour se déduisent du jour (UTC) et du joueur, par
un générateur initialisé par une empreinte de ces deux valeurs : une facile, une moyenne et une
difficile, de trois modules différents. Le tirage n'est pas enregistré ; il est identique à
chaque lecture, et change chaque jour à minuit, sans tâche de fond.

**Récompenses dans le journal.** Les récompenses récupérées sont des événements d'un flux par
joueur (`QuestRewardClaimed`, `DailyChestOpened`), selon le modèle decider. Chaque récompense
déclenche un versement d'or au village (`realm.deposit`), enregistré dans la boîte d'envoi dans
la même transaction, avec la clé d'idempotence `quest:<jour>:<quête>:<joueur>`.

**Temps réel.** Un canal global et discret (`quests`) annonce, sans leurs données, les
événements lus par la projection et les récompenses ; le tableau écoute aussi le canal de la
Taverne. À chaque annonce, il relit sa propre vue.

## Conséquences

### Positives

- Les cinq modules à événements ne connaissent pas les Quêtes ; la Taverne n'expose qu'une
  lecture, sans connaître son lecteur.
- Une nouvelle quête ne demande qu'une ligne du catalogue, et au plus un type d'événement de
  plus dans la projection.
- Le tirage est testable sur des jours et des joueurs quelconques, sans enregistrer de données.
- L'or des récompenses réutilise la boîte d'envoi et l'idempotence du Village : une récompense
  n'est jamais versée deux fois.
- Le tableau se coche en temps réel, quel que soit l'écran où le joueur agit.

### Négatives

- La lecture de la Taverne est synchrone : si elle échoue, le tableau ne peut pas être présenté.
- Le canal global fait relire le tableau de tous les joueurs connectés à chaque action de l'un
  d'eux (dette DT-017).
- L'activité des jours passés n'est pas retirée de la table (dette DT-018).
- Le jour est celui de l'UTC : en France, les quêtes se renouvellent à 1 h ou 2 h du matin.
- Le tirage est prévisible par qui connaît la fonction et l'identifiant d'un joueur ; il n'en
  tire aucun avantage, les quêtes ne pouvant être accomplies qu'en jouant.

## Alternatives écartées

- **Faire publier un événement par la Taverne** : la Taverne aurait dû enregistrer un événement
  pour chaque message, contre la décision de l'ADR 0008, pour un seul lecteur.
- **Lire la table des messages de la Taverne** : la règle d'encapsulation interdit à un module
  de lire les tables d'un autre.
- **Demander l'activité à chaque module par une requête** : six dépendances d'exécution, et une
  modification de chacun des modules.
- **Enregistrer le tirage du jour** : un événement par joueur et par jour, sans information de
  plus que le jour et le joueur.
- **Verser la récompense automatiquement** : le joueur ne verrait pas son or arriver, et chaque
  lecture du tableau aurait pu écrire dans le journal.
- **Un canal par joueur** : il aurait fallu connaître le joueur concerné par chaque événement des
  autres modules au moment de la diffusion, ce que la plateforme ne sait pas faire.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés rend les relectures du
canal global coûteuses (un canal par joueur, alimenté par la projection) ; si la Taverne adopte
l'Event Sourcing ; ou si les joueurs demandent un renouvellement à minuit, heure de Paris.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition de la conception du module, du catalogue des quêtes et
d'une première rédaction de cet ADR. Les règles décrites sont vérifiées par les tests du domaine
(`quests.test.ts`) et de l'API (`quests-api.test.ts`) ; le texte a été relu et validé avant
d'être versionné.
