# ADR-0004 - Manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Ils ne doivent ni
s'attendre indéfiniment les uns les autres, ni être avantagés par l'ordre dans lequel ils
jouent : dans un tour par tour classique, le dernier à jouer connaît les choix des autres.

L'hébergement sans serveur ne permet ni minuteur en mémoire, ni tâche de fond : une fonction
Vercel s'arrête après sa réponse, et la requête suivante peut être traitée par une autre
instance. Les tâches planifiées de l'offre gratuite ne s'exécutent qu'une fois par jour.

L'état d'une expédition est reconstruit à partir de ses événements à chaque requête
(ADR 0002) : tout calcul, y compris un tirage au sort, doit pouvoir être refait à l'identique.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche.

## Décision

Pendant un combat, les héros choisissent simultanément leur action. La manche est résolue
lorsque tous ont choisi, ou lorsque son échéance de trente secondes est atteinte ; un héros
qui n'a rien choisi se défend.

L'échéance est une donnée enregistrée dans les événements (`RoomEntered`, puis
`nextDeadline` de `RoundResolved`), et non un minuteur. Une manche échue est résolue à
l'instant de son échéance, et non à l'instant où ce dépassement est constaté.

Une lecture calcule la résolution des manches échues sans rien enregistrer (`toView`) ;
toute commande commence par enregistrer cette résolution (`settle` dans `decide`) ; le
navigateur envoie une commande d'échéance, idempotente, lorsque son compte à rebours atteint
zéro (`use-countdown.ts`).

Le hasard est tiré dans `decide`, avec un générateur à graine (`random.ts`). La graine de
l'expédition est tirée par le serveur et ne quitte jamais le serveur ; celle de chaque manche
est dérivée de son numéro, unique dans l'expédition. Les résultats des tirages (salles,
dégâts) sont enregistrés dans les événements.

Une action porte le numéro de la manche visée, et est refusée (`ROUND_OVER`) si cette manche
est déjà résolue.

## Conséquences

### Positives

- Aucun joueur n'est avantagé par l'ordre de jeu, et la durée d'une manche est plafonnée,
  quel que soit le nombre de joueurs.
- Aucun minuteur, aucune tâche de fond, aucune infrastructure supplémentaire : le
  fonctionnement est compatible avec l'hébergement sans serveur, sur n'importe quelle instance.
- Une lecture ne modifie jamais l'état, conformément à la sémantique de GET ; elle affiche
  pourtant toujours la manche résolue, dès son échéance.
- La résolution calculée lors d'une lecture est exactement celle qui sera enregistrée, quel
  que soit l'instant de son enregistrement ; les tests peuvent fixer la graine et vérifier
  les résultats exacts.
- Les commandes simultanées de plusieurs joueurs, y compris les commandes d'échéance, sont
  départagées par la concurrence optimiste (`MAX_HEROES + 1` tentatives) ; la commande
  d'échéance est idempotente.
- Une action envoyée trop tard ne peut pas s'appliquer à une manche que le joueur n'a pas vue.

### Négatives

- Si plus aucun joueur ne se manifeste, la résolution d'une manche échue n'est jamais
  enregistrée : le journal peut être en retard sur ce qu'affichent les lectures, et une
  expédition abandonnée n'atteint jamais `GameEnded` (ce qui concernera le classement du TD8).
- Les notifications des autres joueurs dépendent d'un navigateur ouvert, qui envoie la
  commande d'échéance : sans lui, rien n'est diffusé, même si chaque lecture est correcte.
- Les héros pilotés par l'ordinateur (TD7) ne disposent d'aucun navigateur : leurs actions
  devront être produites par les commandes des joueurs humains ou par la résolution elle-même.
- Le générateur pseudo-aléatoire n'est pas cryptographique : la confidentialité du donjon
  repose entièrement sur le secret de la graine.
- La logique est plus difficile à comprendre qu'un minuteur : une lecture affiche une manche
  que le journal ne contient pas encore, et le navigateur envoie une commande qui, souvent,
  n'enregistre rien.

## Alternatives écartées

- **Tour par tour strict** : chaque joueur attend tous les autres, et le dernier à jouer
  connaît leurs choix, ce que les manches simultanées visent précisément à éviter.
- **Minuteur en mémoire ou tâche planifiée** : un minuteur n'a nulle part où s'exécuter sur
  des fonctions qui s'arrêtent après leur réponse, et les tâches planifiées de l'offre
  gratuite ne s'exécutent qu'une fois par jour.
- **Lecture qui enregistre elle-même la résolution** : contraire à la sémantique de GET, elle
  provoquerait des écritures, des conflits de version et des notifications lors de simples
  consultations.
- **Tirage par `Math.random`, dont seul le résultat serait enregistré** : la résolution
  calculée lors d'une lecture différerait de celle enregistrée plus tard par une commande,
  et l'affichage changerait d'une requête à l'autre.

## Réexamen

Cette décision devra être réexaminée si la fin d'une expédition abandonnée doit être
enregistrée (par exemple pour le classement), si des héros pilotés par l'ordinateur doivent
agir sans aucun navigateur ouvert, ou si un service de planification de tâches compatible
avec l'hébergement, à une fréquence suffisante, devient disponible.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD6. Le texte a été relu, ajusté et validé avant d'être
versionné.
