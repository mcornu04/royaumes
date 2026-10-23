# Fiche de cadrage : la Forge

- Auteur : Mathis Cornuault
- Date : 2026-10-23
- Nom technique du module : `forge`

## L'idée

Le joueur commande des armes et des armures à sa forge, à partir de recettes. Chaque pièce est
payée en ressources de son village, forgée pendant une durée propre à la recette, puis exposée
dans son armurerie avec le poinçon du forgeron. Plus il forge, plus son rang monte (apprenti,
compagnon, maître forgeron), et plus il débloque des recettes rares, jusqu'à la Lame du Roi,
légendaire. La Forge donne un usage aux ressources accumulées par le Village, et une progression
visible au joueur ; sa puissance d'armurerie servira au Tournoi.

## Les règles métier

1. Seules les recettes du catalogue peuvent être commandées ; le coût et la durée de la recette
   sont copiés dans la commande.
2. La forge ne fabrique qu'une pièce à la fois.
3. Une recette exige un rang suffisant : apprenti dès le départ, compagnon à partir de 2 pièces
   forgées, maître à partir de 5.
4. Le coût est prélevé dans le village du joueur ; si le stock ne suffit pas, la commande est
   refusée et rien n'est prélevé.
5. Une pièce payée n'est récupérable qu'après sa durée de forge, comptée à partir du paiement.
6. Une commande annulée avant la fin de la forge est remboursée intégralement.
7. Une pièce récupérée entre dans l'armurerie et fait progresser le rang et la puissance du
   forgeron.

Le catalogue compte six recettes, de quatre raretés :

| Pièce | Rareté | Coût | Durée | Rang requis |
| --- | --- | --- | --- | --- |
| Dague | Commune | 30 bois, 10 pierre | 30 s | Apprenti |
| Arc long | Commune | 60 bois | 45 s | Apprenti |
| Hache de guerre | Rare | 50 bois, 40 pierre | 1 min | Apprenti |
| Bouclier de pierre | Rare | 20 bois, 70 pierre | 1 min | Compagnon |
| Marteau runique | Épique | 60 bois, 60 pierre, 10 or | 2 min | Compagnon |
| Lame du Roi | Légendaire | 100 bois, 80 pierre, 30 or | 3 min | Maître forgeron |

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Consulter son atelier : rang, pièce en cours, armurerie, catalogue | Lecture | `GET /api/forge/workshop` |
| Commander une pièce | Commande `PlaceOrder` | `POST /api/forge/orders` |
| Annuler la pièce en cours, et être remboursé | Commande `CancelOrder` | `POST /api/forge/orders/current/cancel` |
| Récupérer la pièce forgée | Commande `CollectItem` | `POST /api/forge/orders/current/collect` |

## Le stockage envisagé

Journal d'événements, un flux `forge-<joueur>` par joueur, selon le modèle decider : l'histoire
de l'atelier a une valeur de jeu (elle fait l'armurerie et le rang), et la règle « une pièce à la
fois » est garantie par la concurrence optimiste du flux. Aucune table propre.

## La communication avec les modules existants

Avec le Village, par la boîte d'envoi : la Forge demande le prélèvement du coût
(`realm.withdraw`, avec une adresse de retour) et, en cas d'annulation, le remboursement
(`realm.deposit`). C'est une saga orchestrée par la Forge, dont le remboursement est l'étape de
compensation. Le Village n'est pas modifié : seuls ses sujets publics sont utilisés.

## Les données personnelles

Le nom du joueur, gravé sur chaque pièce (le poinçon), dans les événements de l'atelier : il est
exporté, et remplacé par « Joueur effacé » à la suppression du compte.

## Les bonus visés

1. B5 - Saga avec étape compensable : le remboursement de l'annulation.
2. B2 - Échéance gérée sans tâche de fond : la fin de la forge d'une pièce.
3. B1 - Canal temps réel propre au module : `forge-<joueur>`, réservé au propriétaire.
4. B8 - Nouvelle fonction d'aptitude protégeant une propriété du module.
