# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Donjon a besoin de personnages pilotés par l'ordinateur : des monstres dont le comportement
dépend d'un niveau de difficulté choisi par l'hôte, et des compagnons qui permettent à un
joueur seul de jouer une expédition.

L'hébergement ne permet aucun processus permanent : aucune boucle de jeu ne peut s'exécuter
entre deux requêtes (ADR 0004).

L'état d'une expédition est reconstruit à partir de ses événements (ADR 0002), et une manche
peut être calculée lors d'une lecture sans être enregistrée, puis enregistrée plus tard par
une commande (ADR 0004) : toute décision doit donc pouvoir être recalculée à l'identique.

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine, appelées au
moment de la résolution d'une manche (`resolveRound`), et à aucun autre moment.

Elles ne tirent au sort qu'au moyen du générateur pseudo-aléatoire de la manche, dont la
graine est dérivée de celle de l'expédition et du numéro de la manche.

Leurs résultats, actions des compagnons comprises, sont enregistrés dans l'événement
`RoundResolved` : la relecture d'une expédition n'exécute jamais l'intelligence artificielle.

Le comportement des monstres est isolé derrière un port de stratégie (`MonsterStrategy`,
`monster-strategies.ts`), dont chaque niveau de difficulté fournit une mise en œuvre ; le
compagnon applique une règle fixe (`companion.ts`).

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche ; sinon, il
se défend.

L'équilibre du jeu est mesuré par simulation (`simulation.ts`, `scripts/simulate-dungeon.ts`)
et protégé par des tests statistiques sur des graines fixées.

## Conséquences

### Positives

- Aucune boucle de jeu, aucune tâche de fond, aucune brique d'architecture nouvelle :
  l'intelligence artificielle s'insère dans la résolution déjà organisée au TD6.
- Les décisions sont reproductibles : la même manche produit les mêmes décisions, qu'elle soit
  calculée lors d'une lecture ou enregistrée par une commande.
- Une modification ultérieure de l'intelligence artificielle ne change pas les expéditions déjà
  jouées, dont les décisions sont enregistrées.
- Ajouter un niveau de difficulté consiste à écrire une stratégie, sans modifier les règles du
  combat ; la vérification des types signale toute stratégie manquante.
- Le comportement se teste de manière exacte, par invariants et statistiquement, sans base de
  données, sans serveur, sans attente et sans test instable.
- La simulation permet d'équilibrer le jeu à partir de mesures : elle a montré que l'intuition
  de départ était fausse et guidé la correction.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir entre deux échéances ni de sa propre
  initiative : il n'agit qu'à la résolution d'une manche, ou à l'échéance d'un tour.
- La qualité de l'équilibre dépend de la règle suivie par les joueurs simulés, volontairement
  simple (ils ne soignent jamais) : des joueurs réels plus habiles ou plus maladroits peuvent
  obtenir des résultats différents.
- L'intelligence artificielle s'exécute lors de chaque lecture d'une manche échue : son coût de
  calcul doit rester négligeable.
- Les monstres du niveau difficile exploitent les actions des héros, connues du serveur ; cet
  avantage, voulu, doit rester confiné au serveur et ne jamais apparaître dans les vues.
- Les tests statistiques ne vérifient qu'une tendance, avec des seuils choisis : un
  déséquilibre modéré peut leur échapper.

## Alternatives écartées

- **Boucle de jeu exécutée par un processus permanent** : impossible sur des fonctions qui
  s'arrêtent après leur réponse, et contraire aux critères d'hébergement du projet.
- **Décisions prises par le navigateur d'un joueur** : elles dépendraient d'un navigateur
  ouvert, pourraient être falsifiées par le joueur, et révéleraient au client des informations
  qu'il ne doit pas connaître (les actions des autres héros, pour les monstres).
- **Recalcul des décisions lors de la relecture, plutôt que leur enregistrement** : une
  modification de l'intelligence artificielle changerait rétroactivement les expéditions déjà
  jouées, contrairement à la règle de l'ADR 0002.

## Réexamen

Cette décision devra être réexaminée si un personnage doit agir en temps réel, en dehors de la
résolution des manches, si l'intelligence artificielle devient trop coûteuse en calcul pour
être exécutée lors d'une lecture, ou si les mesures faites sur les parties réelles du journal
de production s'écartent nettement de celles de la simulation.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD7. Le texte a été relu, ajusté et validé avant d'être
versionné.
