# ADR-0008 - Un stockage classique pour la Taverne, et la réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne conserve des données personnelles destinées à disparaître : des messages, à
supprimer trente jours après leur publication, et la présence des joueurs, qui ne doit pas
survivre à leur visite. Le RGPD impose en outre au jeu entier les droits d'accès, de
portabilité (articles 15 et 20) et d'effacement (article 17).

Le jeu existant a copié des données personnelles dans son journal : le nom des joueurs dans
les événements du Donjon (`GameCreated`, `PlayerJoined`) et du Marché (`OfferPublished`,
`OfferAccepted`), le nom du village dans `VillageFounded`. Ces événements appartiennent à des
flux parfois partagés avec d'autres joueurs : l'expédition ouverte avec Bob, l'offre acceptée
par Carol.

Le journal est en ajout seul (ADR 0002) : aucun événement n'est jamais modifié ni supprimé, et
les projections du Classement, des expéditions ouvertes et des offres en dépendent (ADR 0006).

## Décision

La Taverne utilise des tables ordinaires, dans son schéma `tavern`, sans Event Sourcing : les
messages et les présences sont insérés, puis supprimés à l'expiration de leur durée de
conservation.

Son canal temps réel est alimenté par une source fournie par le module (`ChannelSource`), et
non par le journal.

La présence repose sur un signal périodique du navigateur, toutes les trente secondes : une
ligne par joueur présent, mise à jour à chaque signal, supprimée à son départ ou deux minutes
après son dernier signal ; aucun historique des visites n'est constitué.

Les durées de conservation sont appliquées à la lecture, et chaque jour par la route des tâches
quotidiennes (`/api/cron/daily`), protégée par `CRON_SECRET`.

Chaque module déclare ses données personnelles par un contributeur (`personal-data.ts`) :
export, réécriture de ses événements (`redact`) et effacement de ses tables (`erase`).

L'effacement réécrit les seuls champs de nom des événements du joueur, remplacés par
« Joueur effacé » ou « Village effacé », par une fonction unique de la plateforme
(`rewriteJournal`), dans une transaction qui ajoute une ligne au registre des effacements
(`platform.erasures`) ; ce registre ne contient aucune donnée sur le joueur.

L'identité est effacée en dernier, après le journal et les tables des modules ; chaque étape est
idempotente.

## Conséquences

### Positives

- Le joueur exerce lui-même ses droits, sans intervention : il télécharge ses données et
  supprime son compte depuis la page « Mes données ».
- L'effacement n'altère ni les états reconstruits, ni l'historique des autres joueurs : seuls
  les noms changent, les types, versions, positions, graines et identifiants sont intacts.
- La durée de conservation est garantie même sans activité, grâce à la tâche quotidienne.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : ni
  `decide`, ni `evolve`, ni versions, ni projections.
- L'export et l'effacement couvrent le jeu entier sans que la plateforme connaisse les
  événements d'aucun module.
- Un effacement interrompu peut être relancé par le joueur lui-même, puisque son compte
  existe encore tant que l'effacement n'est pas terminé.

### Négatives

- La réécriture est une exception à la règle de l'ajout seul : toute modification future du
  journal devra en respecter strictement les limites (champs personnels seulement, fonction
  unique, traçabilité), faute de quoi la règle perdrait son sens.
- L'effacement et l'export parcourent tout le journal : leur coût croît avec sa taille.
- Chaque événement futur crée une obligation : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement sans aucune erreur.
- L'identifiant du joueur reste dans le journal : sa pseudonymisation dépend de la destruction
  effective de tout lien avec la personne, y compris hors de la base (journaux de l'hébergeur).
- La présence et les messages ne sont pas diffusés de la même manière : la présence n'apparaît
  chez les autres joueurs qu'à leur signal suivant, dans les trente secondes.

## Alternatives écartées

- **Event Sourcing pour la Taverne** : un journal en ajout seul contredit la finalité de données
  destinées à disparaître, et l'historique des messages n'a aucune valeur pour le jeu.
- **Suppression des flux du joueur** : impossible pour les flux partagés, dont la suppression
  priverait les autres joueurs de leur propre historique.
- **Effacement cryptographique** : il aurait fallu chiffrer chaque donnée personnelle dès la
  conception, avec une clé par joueur, et déchiffrer dans chaque module et chaque projection ;
  il ne traite pas les événements déjà enregistrés en clair.
- **Références sans copie** : n'enregistrer que l'identifiant et retrouver le nom à
  l'affichage est la meilleure conception pour l'avenir, mais ne règle pas le cas des
  événements existants.
- **Service externe de présence** (base clé-valeur en mémoire) : une infrastructure
  supplémentaire, hors des critères du projet, pour un besoin que deux tables satisfont.

## Réexamen

Cette décision devra être réexaminée lors de la conception d'un nouveau module, pour lequel les
références sans copie devraient être préférées dès l'origine ; si la taille du journal rend
l'effacement trop long pour une requête ; ou si la doctrine sur l'anonymisation des
identifiants pseudonymes évolue.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD10. Le texte a été relu, ajusté et validé avant d'être
versionné.
