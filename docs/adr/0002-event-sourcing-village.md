# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-19

## Contexte

L'état d'un village (nom, stock, niveaux des bâtiments) n'est jamais saisi directement : il
évolue uniquement par des actions successives du joueur, la fondation puis les améliorations
de bâtiments, entre lesquelles la production s'accumule avec le temps.

La suite du projet prévoit d'exploiter ces actions au-delà du seul module Village : les
changements devront être diffusés en temps réel aux joueurs (TD5), et des vues de lecture,
comme le classement, devront être construites à partir de l'activité des joueurs (TD8).

L'application est hébergée sans serveur (Vercel) : plusieurs instances, qui ne partagent
aucune mémoire, peuvent traiter simultanément des requêtes pour un même village, par exemple
lors d'un double clic. Seule la base de données est commune à toutes les instances.

## Décision

L'état du village n'est pas stocké : il est reconstruit à chaque lecture en rejouant ses
événements (`replay` du domaine).

Les événements sont enregistrés dans un journal générique de la plateforme, la table
`platform.events` (`src/platform/event-store/`), en ajout seul. Chaque village dispose de son
propre flux, nommé `village-<joueur>`, dans lequel chaque événement porte une version.

Les écritures concurrentes sont détectées par la contrainte d'unicité sur le couple
(flux, version) de la base de données. Une commande en conflit est entièrement rejouée
(chargement, décision, enregistrement) par `withOptimisticRetry`, au plus trois fois.

Chaque événement porte toutes les informations nécessaires à son application : par exemple,
`BuildingUpgraded` enregistre le coût effectivement payé, et non un coût à recalculer.

## Conséquences

### Positives

- Historique complet et fiable de chaque village : on sait comment il a atteint son état,
  et pas seulement quel est cet état.
- L'état peut être reconstruit à tout moment, y compris à un instant passé, ou après la
  correction d'une règle.
- Les événements alimenteront directement le temps réel (TD5) et les vues de lecture (TD8),
  y compris pour des usages qui n'étaient pas prévus lors de leur enregistrement.
- La concurrence est garantie par la base de données elle-même, quel que soit le nombre
  d'instances, sans verrou ni attente ; un double clic ne fait jamais payer deux fois.
- Le journal est générique : le Donjon et le Marché pourront l'utiliser sans modification.

### Négatives

- Un événement enregistré ne peut plus être modifié : toute évolution de sa structure
  oblige le code à savoir lire à la fois les anciennes et les nouvelles versions.
- Chaque lecture rejoue l'ensemble du flux du village ; le coût augmente avec le nombre
  d'événements.
- Les questions transversales (par exemple les joueurs les plus riches) ne peuvent pas être
  posées directement au journal : elles exigent des vues de lecture dédiées.
- La conversion entre événements génériques du journal et événements typés du domaine
  repose sur des assertions de type, non vérifiées à l'exécution.
- Un journal dont rien n'est supprimé entre en tension avec le droit à l'effacement (RGPD).

## Alternatives écartées

- **Stockage de l'état dans une table propre au module (CRUD)** : une ligne par village,
  mise à jour à chaque action. Plus simple, mais l'historique est perdu, et le temps réel
  comme le classement devraient reconstituer après coup ce qui a changé.
- **Verrouillage pessimiste** : verrouiller le village dès son chargement évite les conflits,
  mais impose des attentes et le maintien d'un verrou pendant tout le traitement, ce qui
  s'accorde mal avec une exécution sans serveur ; les conflits restent par ailleurs rares.
- **Vérification de la version dans le code avant l'écriture** (comme l'adaptateur en mémoire
  du TD2) : fiable dans un seul processus, mais pas entre plusieurs instances, et elle laisse
  un intervalle entre la vérification et l'écriture.

## Réexamen

Cette décision devra être réexaminée si le nombre d'événements par village devient tel que
la reconstruction de l'état ralentit sensiblement les requêtes (l'introduction d'instantanés
serait alors à étudier), ou si les conflits d'écriture deviennent fréquents au point
d'épuiser régulièrement les trois tentatives.

## Usage de l'IA générative

Juse pour la suggestion d'idée.
