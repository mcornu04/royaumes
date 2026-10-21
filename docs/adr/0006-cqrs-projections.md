# ADR-0006 - Séparer les modèles de lecture du modèle d'écriture, tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux du journal : le classement des joueurs, qui dépend de
l'activité de tous les villages et de toutes les expéditions, et la liste des expéditions
ouvertes. Calculées par rejeu à chaque consultation, leur coût croît avec l'historique du jeu,
sans limite : c'est la dette DT-005, consignée au TD6.

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucun processus de fond ne peut
surveiller le journal pour tenir des tables à jour, et les tâches planifiées de l'offre
gratuite ne s'exécutent qu'une fois par jour.

Le journal attribue à chaque événement une position globale, croissante mais non continue
(ADR 0002) : une insertion refusée consomme une position, et deux insertions simultanées ne
sont pas nécessairement validées dans l'ordre de leurs positions.

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, placés dans le schéma
PostgreSQL de leur module (`ranking`, `dungeon`) ; les décisions s'appuient toujours sur le
modèle d'écriture, le journal, qui reste la seule source de vérité.

Chaque modèle de lecture est tenu à jour par une projection (`src/platform/projection/`), dont
le point de reprise, la position du dernier événement appliqué, est enregistré dans la table
`platform.projections`.

Une projection est rattrapée au moment de sa consultation, dans une seule transaction qui
comprend les écritures de la projection et la mise à jour du point de reprise, ce dernier étant
verrouillé (`FOR UPDATE`) pendant toute la transaction.

Le rattrapage s'arrête devant une position manquante tant que l'événement qui la suit a été
enregistré il y a moins de cinq secondes ; au-delà, la position est considérée comme celle
d'une insertion refusée, et franchie.

Chaque projection porte une version : une version du code plus élevée que celle des tables
provoque leur reconstruction à partir du journal, une version moins élevée interdit toute
écriture.

Le classement est annoncé aux navigateurs par un canal global et discret, qui suit dans tout
le journal les types d'événements de la projection ; l'interface relit le classement jusqu'à
ce que la projection ait atteint la position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique : un rattrapage ne traite que les
  événements nouveaux, et la liste des expéditions ouvertes ne lit que la dernière heure.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Village et le
  Donjon ignorent l'existence du Classement.
- De nouvelles informations sont calculées pour tout le passé sans migration de données : le
  meilleur butin a été obtenu pour des expéditions jouées avant qu'il soit imaginé.
- Une erreur dans une projection se corrige en corrigeant le code et en augmentant sa version :
  aucune donnée n'est à réparer à la main.
- Aucune tâche de fond ni aucune opération manuelle après un déploiement : la reconstruction a
  lieu d'elle-même, à la première consultation.
- Le moteur, générique, a servi à deux modules ; une nouvelle projection n'a qu'à décrire
  l'effet de chaque événement.

### Négatives

- La cohérence est à terme : un modèle de lecture peut avoir quelques secondes de retard sur
  le journal, que l'interface doit savoir attendre.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur Vercel : elle
  deviendra impossible au-delà d'une certaine taille du journal.
- Après un retour à une version précédente de l'application, une projection dont la version a
  été augmentée cesse d'avancer jusqu'au déploiement suivant, puisque le code ancien n'écrit
  plus.
- Le Classement dépend du langage publié des autres modules : un événement modifié ou ajouté
  sans réexamen de ses lecteurs passe inaperçu, comme l'a montré la liste des expéditions
  ouvertes, qui ignorait les compagnons.
- La première consultation qui suit une longue inactivité paie le rattrapage, et le verrou du
  point de reprise sérialise les rattrapages simultanés d'une même projection.
- Une position manquante récente retarde la projection de cinq secondes au plus, ce qui
  suppose qu'aucune insertion dans le journal ne dure davantage.

## Alternatives écartées

- **Mise à jour des modèles de lecture dans la commande, par le module qui écrit** : le Village
  et le Donjon devraient connaître toutes les projections qui dépendent d'eux, contrairement
  aux règles d'encapsulation des modules.
- **Tâche planifiée** : une seule exécution par jour sur l'offre gratuite, soit un classement
  en retard d'une journée.
- **Processus de fond abonné au journal** : impossible sans processus permanent sur
  l'hébergement retenu.
- **Vue matérialisée de PostgreSQL** : entièrement recalculée à chaque rafraîchissement, son
  coût croîtrait avec l'historique, comme le rejeu qu'elle remplacerait.
- **Maintien du calcul par rejeu** : c'est précisément la dette DT-005, dont le coût croît sans
  limite.

## Réexamen

Cette décision devra être réexaminée si la durée d'une reconstruction approche la durée
maximale d'une fonction, si le nombre de consultations simultanées fait du verrou du point de
reprise un goulet d'étranglement, ou si un besoin de lecture strictement à jour apparaît, qui ne
pourrait pas s'accommoder de la cohérence à terme.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD8. Le texte a été relu, ajusté et validé avant d'être
versionné.
