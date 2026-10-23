# Revue de sécurité de la Forge : intégrité des commandes et des ressources

- Date : 2026-10-23
- Périmètre : API du module Forge, gestionnaire de messages `forge.transfer-result`, saga de
  paiement avec le Village, canal temps réel `forge-<joueur>`, données personnelles.
- Références : OWASP Top 10 (A01 Broken Access Control, A03 Injection, A04 Insecure Design,
  A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| F1 | Toutes les routes de la Forge sont réservées aux joueurs connectés | Test « refuse toute requête anonyme (401) » (`forge-api.test.ts`) | Le test passe : les quatre routes (`GET /workshop`, `POST /orders`, `POST /orders/current/cancel`, `POST /orders/current/collect`) répondent 401 sans session. Elles sont protégées par `requireUser` dans `create-api.ts`. | conforme |
| F2 | Un joueur n'agit que sur son propre atelier | Tests « n'agit que sur l'atelier du joueur connecté » et « ignore un identifiant de joueur glissé dans le corps » | Les tests passent : Bob ne peut ni annuler ni récupérer la commande d'Alice (404), et un `playerId` ajouté au corps est ignoré, le village de Bob restant intact. Aucune route n'accepte d'identifiant de joueur : `api.ts` lit toujours `c.var.userId`. | conforme |
| F3 | Seules les recettes du catalogue peuvent être commandées | Test « refuse une recette absente du catalogue (400) » ; règle 1 du domaine | Le test passe : `excalibur` et un corps vide sont refusés par le schéma `PlaceOrderInput` (énumération des recettes). Le domaine refuse aussi une recette inconnue (`UNKNOWN_RECIPE`), en défense en profondeur. | conforme |
| F4 | Aucune commande ne crée ni ne détruit de ressources | Tests « prélève le coût dans le village… », « refuse la commande si le village ne peut pas la payer… », « rembourse intégralement une commande annulée… » | Les tests passent : le stock baisse exactement du coût de la recette ; un paiement refusé laisse le stock identique ; une annulation le rétablit à l'identique. Observé en local (compte de démonstration) : dague commandée, stock −30 bois et −10 pierre, puis annulée, stock rétabli. | conforme |
| F5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « ignore une réponse en double, ou une réponse qui ne concerne pas la commande en cours » (`forge.test.ts`) | Le test passe : une réponse en double, une réponse à une autre commande ou à un remboursement ne produisent aucun événement. Côté Village, chaque mouvement est identifié par une clé d'idempotence (`forge:<n>:pay:<joueur>`), retenue dans l'état du village depuis le TD9. | conforme |
| F6 | Les mouvements de la Forge ne peuvent pas être confondus avec ceux d'un autre module | Test « rejette un identifiant qui n'est pas celui d'un mouvement de la Forge » ; test du gestionnaire (`messages.test.ts`) | Les tests passent : l'identifiant d'un mouvement du Marché (`o1:reserve`) ou un identifiant mal formé est rejeté, et le gestionnaire lève alors une erreur sans modifier aucun atelier ; le message finit en lettre morte, examinable par `scripts/dead-letters.ts`. | conforme |
| F7 | Une pièce n'est récupérable qu'à l'échéance de sa forge, quelle que soit la requête | Test « ne livre la pièce qu'à son échéance… » ; règle 5 du domaine | Le test passe : 409 `NOT_READY` avant l'échéance, 200 après. L'échéance est calculée par le serveur au paiement (`readyAt`), avec son horloge ; aucune donnée de la requête n'intervient. | conforme |
| F8 | Le canal temps réel d'un atelier n'est accessible qu'à son propriétaire | Test « réserve le canal d'un atelier à son propriétaire » | Le test passe : Alice reçoit 403 sur `forge-bob`, et 200 sur son propre canal. La règle `canSubscribe` compare le canal à celui du joueur connecté. | conforme |
| F9 | Le joueur obtient toutes les données de la Forge le concernant, et son nom est effacé avec son compte | Test « exporte les commandes du joueur, puis efface son nom des événements de l'atelier » | Le test passe : l'export contient les commandes (avec le poinçon) et l'armurerie ; après la suppression du compte, `smithName` vaut « Joueur effacé » dans `OrderPlaced` et `ItemCollected`. | conforme |
| F10 | Un joueur ne peut pas saturer la Forge par des commandes répétées | Lecture de `api.ts` et du domaine | Aucune limite de fréquence n'est appliquée : un joueur peut enchaîner commandes et annulations. Chaque cycle est remboursé intégralement, sans gain possible, et ne concerne que son propre flux ; la limitation des tentatives de Better Auth ne couvre que l'authentification. Accepté pour ce projet, au même titre que les autres modules. | risque accepté |

## Synthèse

- 9 exigences conformes, 0 non conforme, 1 risque accepté (F10).
- Limite relevée par la revue : chaque consultation de la Forge distribue toute la boîte
  d'envoi ; elle est consignée dans le registre de la dette technique (DT-013).
- Actions décidées :
  - toute nouvelle étape de la saga sera accompagnée d'un test de remise en double ;
  - tout nouvel identifiant de mouvement conservera le préfixe du module qui l'émet ;
  - une limite de fréquence commune à tous les modules sera réexaminée avant toute ouverture
    publique du jeu.
