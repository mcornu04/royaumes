# Fiche de cadrage : les Quêtes du jour

- Auteur : Mathis Cornuault
- Date : 2026-10-23
- Nom technique du module : `quests`

## L'idée

Chaque jour, le joueur reçoit trois quêtes : une facile, une moyenne et une difficile, dans
trois parties différentes du royaume (Village, Forge, Donjon, Tournoi, Marché, Taverne). Elles
s'affichent dans un tableau, à droite de chaque écran du jeu, et se cochent d'elles-mêmes dès
qu'il les accomplit en jouant. Il récupère alors leur or, qu'il voit s'envoler jusqu'à son
village, puis ouvre le coffre du jour une fois les trois récompenses récupérées. Les quêtes
donnent une raison de revenir chaque jour, et de parcourir tous les modules du jeu.

## Les règles métier

1. Chaque jour, chaque joueur reçoit trois quêtes, une facile, une moyenne et une difficile, de
   trois modules différents, tirées à partir du jour et du joueur.
2. Une quête avance avec les actions du joueur faites le jour même dans les autres modules.
3. Une quête est cochée dès que son objectif est atteint.
4. La récompense d'une quête cochée se récupère une seule fois, et seulement le jour même.
5. Il faut un village pour recevoir une récompense.
6. Le coffre du jour s'ouvre une fois les trois récompenses récupérées, une seule fois par jour.

| Quête | Module | Difficulté | Récompense |
| --- | --- | --- | --- |
| Améliorer un bâtiment du village | Village | Facile | 20 or |
| Forger une pièce | Forge | Facile | 20 or |
| Publier une offre au Marché | Marché | Facile | 15 or |
| Écrire un message à la Taverne | Taverne | Facile | 15 or |
| Améliorer deux bâtiments du village | Village | Moyenne | 30 or |
| Terminer une expédition au Donjon | Donjon | Moyenne | 30 or |
| Participer à un tournoi | Tournoi | Moyenne | 30 or |
| Écrire trois messages à la Taverne | Taverne | Moyenne | 30 or |
| Forger une pièce rare ou mieux | Forge | Difficile | 60 or |
| Remporter une expédition au Donjon | Donjon | Difficile | 60 or |
| Remporter un tournoi | Tournoi | Difficile | 60 or |
| Coffre du jour | — | — | 50 or |

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir ses quêtes du jour, leur avancement et le coffre | Lecture | `GET /api/quests/board` |
| Récupérer la récompense d'une quête accomplie | Commande `ClaimReward` | `POST /api/quests/quests/:questId/claim` |
| Ouvrir le coffre du jour | Commande `OpenChest` | `POST /api/quests/chest/open` |

## Le stockage envisagé

Journal d'événements pour les récompenses récupérées (un flux `quests-<joueur>`), qui garantit
qu'une récompense ne l'est qu'une fois. Tables classiques dans le schéma `quests` pour l'activité
quotidienne des joueurs, modèle de lecture tenu par une projection. Le tirage du jour n'est pas
enregistré : il se déduit du jour et du joueur.

## La communication avec les modules existants

- Village, Forge, Donjon, Tournoi et Marché : lecture de leur langage publié par la projection.
- Taverne : lecture du nombre de messages d'un joueur, par une fonction de son point d'entrée,
  puisqu'elle n'enregistre pas d'événements.
- Village : versement de l'or des récompenses par la boîte d'envoi (`realm.deposit`).

## Les données personnelles

L'activité quotidienne du joueur dans les autres modules (une donnée de comportement), et les
récompenses qu'il a récupérées : exportées, et l'activité supprimée avec le compte.

## Les bonus visés

1. B6 - Communication avec au moins deux modules existants (six modules lus).
2. B4 - Modèle de lecture tenu par une projection, avec point de reprise et version.
3. B2 - Échéance gérée sans tâche de fond : le renouvellement des quêtes à minuit.
4. B1 - Canal temps réel propre au module.
