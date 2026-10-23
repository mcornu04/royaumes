# ADR-0010 - L'atelier de la Forge est conservé dans le journal d'événements, un flux par joueur, et sa durée de forge est une échéance paresseuse

- Statut : accepté
- Date : 2026-10-23

## Contexte

La Forge permet à un joueur de commander une pièce (arme ou armure) à partir d'une recette.
La pièce est payée en ressources de son village, forgée pendant une durée propre à la recette,
puis récupérée dans son armurerie. Le nombre de pièces récupérées détermine le rang du forgeron,
qui débloque les recettes les plus rares, et la puissance de l'armurerie.

Les données de la Forge ont une valeur de jeu durable : l'armurerie et le rang sont le résultat
de toute l'histoire de l'atelier, et le Tournoi (ADR 0012) les lit pour établir les
caractéristiques des combattants. Une commande traverse plusieurs états (paiement, forge,
récupération ou annulation), dont certains dépendent d'une réponse du Village (ADR 0011).

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucun minuteur ne peut marquer
une pièce comme prête à la fin de sa forge.

## Décision

L'atelier d'un joueur est un agrégat conservé dans le journal d'événements de la plateforme,
dans un flux `forge-<joueur>`, selon le modèle decider (`decide`, `evolve`) et la concurrence
optimiste des autres modules (`withOptimisticRetry`). Il n'a aucune table propre.

Les événements sont `OrderPlaced`, `OrderPaid`, `OrderRejected`, `OrderCancelled` et
`ItemCollected`. Le coût et la durée de la recette sont copiés dans `OrderPlaced` : un
rééquilibrage du catalogue ne modifie ni les commandes passées, ni le remboursement d'une
commande en cours.

La fin de la forge est une échéance paresseuse : `OrderPaid` enregistre l'instant `readyAt`,
la vue présente la pièce comme prête dès que cet instant est passé, et la récupération n'est
acceptée qu'à partir de cet instant. Aucun événement n'enregistre la fin de la forge.

Le nom du joueur est gravé sur chaque pièce (`smithName`, le poinçon) : il est déclaré comme
donnée personnelle par le contributeur `personal-data.ts`, et réécrit lors de l'effacement d'un
compte (ADR 0008).

Le domaine ne lit ni l'horloge ni le hasard : l'instant de chaque commande lui est fourni.
Une fonction d'aptitude (`src/bootstrap/architecture.test.ts`) le vérifie pour tous les modules.

## Conséquences

### Positives

- L'armurerie et le rang se déduisent de l'histoire de l'atelier, sans état redondant à
  maintenir ; le Tournoi les lit dans ce même journal, sans dépendre du code de la Forge.
- Aucune migration n'est nécessaire : la Forge réutilise le journal et la boîte d'envoi.
- La règle « une pièce à la fois » est garantie par la concurrence optimiste du flux : deux
  commandes simultanées d'un même joueur ne peuvent pas être acceptées toutes les deux.
- L'échéance paresseuse rend la règle de la durée de forge testable à la milliseconde près,
  sans attente réelle.

### Négatives

- La consultation d'un atelier relit tout son flux ; son coût croît avec le nombre de commandes
  du joueur.
- Le nom du joueur est copié dans les événements : son effacement demande une réécriture du
  journal, alors qu'une référence sans copie l'aurait évité (réexamen de l'ADR 0008).
- Une pièce prête n'apparaît dans l'armurerie qu'une fois récupérée par le joueur : une pièce
  oubliée ne compte ni pour le rang, ni pour le Tournoi.

## Alternatives écartées

- **Tables classiques, comme la Taverne** : les données de la Forge ne sont pas destinées à
  disparaître, et leur histoire fait le rang du forgeron ; il aurait fallu tenir un état et un
  historique à la main, sans la concurrence optimiste du journal.
- **Un flux par commande, comme les offres du Marché** : la règle « une pièce à la fois » aurait
  porté sur plusieurs flux, qu'aucune transaction ne protège ensemble.
- **Récupération automatique à l'échéance, par un message différé** : elle aurait ajouté un
  message par commande pour un geste que le joueur fait de toute façon en revenant à sa forge.
- **Référencer le joueur par son seul identifiant** : le nom aurait été lu à l'affichage dans un
  autre module, ce qui aurait créé une dépendance de la Forge vers l'identité.

## Réexamen

Cette décision devra être réexaminée si le nombre de commandes d'un joueur rend la relecture de
son flux perceptible (instantané de l'atelier), si d'autres modules doivent connaître l'armurerie
autrement que par le journal, ou si la récupération automatique des pièces devient une demande
des joueurs.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition de la conception du module et d'une première rédaction de
cet ADR, à partir des exigences de l'évaluation. La conception a été discutée et validée avant
la réalisation ; le texte a été relu, ajusté et validé avant d'être versionné.
