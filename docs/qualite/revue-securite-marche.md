# Revue de sécurité du Marché : intégrité des échanges

- Date : 2026-10-21
- Périmètre : API du module Marché, gestionnaires de messages du Village et du Marché, boîte d'envoi et sa route de distribution, canal temps réel du Marché.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| M1 | Un joueur ne publie, n'accepte et ne retire une offre qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Dans `market/api.ts`, chaque route lit le joueur dans `c.var.userId` et `c.var.userName`, renseignés par `requireUser` ; seuls l'identifiant de l'offre (`param('id')`) et les quantités (validées par Zod) proviennent de la requête. | conforme |
| M2 | Seul le vendeur peut retirer son offre et récupérer les ressources en séquestre | Test « restitue les ressources au vendeur qui retire son offre » | Le test passe. Observé en local : le vendeur retire son offre et ses 10 bois lui sont restitués ; un autre joueur qui tente de la retirer reçoit 403 `NOT_SELLER`. La restitution est versée au vendeur enregistré dans l'offre, jamais au joueur qui fait la requête. | conforme |
| M3 | Un joueur ne peut pas accepter sa propre offre | Tests « refuse l'acceptation de sa propre offre... » et « restitue les ressources au vendeur... » | Les tests passent : le domaine refuse l'acceptation par le vendeur. | conforme |
| M4 | Aucun échange ne crée ni ne détruit de ressources, y compris lors d'acceptations simultanées | Test « ne conclut l'échange qu'avec un seul acheteur, lors de deux acceptations simultanées » | Le test passe : un seul acheteur l'emporte, l'autre reçoit `NOT_OPEN`, et les trois villages totalisent toujours 300 bois et 150 pierre. Observé en local : après l'échange de 60 bois contre 30 pierre, le vendeur a perdu 60 bois et gagné 30 pierre, l'acheteur l'inverse, production comprise. | conforme |
| M5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » ; test « ignore une réponse en double... » | Les tests passent. Côté Village, l'identifiant du mouvement (`transferId`, choisi par le Marché) est retenu dans l'état, et un refus est enregistré comme un fait ; côté Marché, une réponse qui ne correspond pas à l'étape attendue ne produit aucun événement. La tentative de paiement est numérotée (`pay-<n>`), si bien qu'un nouvel acheteur n'hérite pas du refus du précédent. | conforme |
| M6 | Les quantités échangées sont des entiers strictement positifs, à l'entrée de l'API comme à la réception d'un message | Publication d'une offre de -50 bois ; schéma `ResourceAmounts` | Observé en local : une offre de -50 bois est refusée (400 `INVALID_INPUT`), de même que 0, 1,5, une ressource inconnue (« diamant ») et une offre vide ; le stock du village n'a pas changé. `ResourceAmounts` exige des entiers strictement positifs, au moins une ressource et aucune clé inconnue (`.strict()`). À la réception, le Village valide chaque message par `TransferRequest`, qui réutilise ce schéma. | conforme |
| M7 | Aucun joueur ne peut provoquer un mouvement de ressources dans un village autrement que par une offre | Lecture des routes de l'API : aucune n'enregistre de message dans la boîte d'envoi | Aucune route d'API (`*/api.ts`) ne manipule la boîte d'envoi. Les seuls messages adressés au Village (`realm.withdraw`, `realm.deposit`) sont produits par `market-service.ts`, à partir des événements d'une offre ; la route de distribution remet des messages existants sans en créer. | conforme |
| M8 | La route de distribution planifiée n'est accessible qu'avec le secret, absent du dépôt | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » ; `git grep -n CRON_SECRET` | Le test passe. Observé en local : 401 sans en-tête et avec un faux secret ; la route est fermée par défaut en l'absence de secret configuré. `git grep` ne trouve que le nom de la variable (`.env.example`, vide, code et documentation) et la valeur fictive `secret-de-test` des tests, jamais le secret de production. | conforme |
| M9 | Le canal du Marché ne transmet aucune donnée d'événement | Route de repli `/api/stream/market/events?after=0` | Observé en local : la route de repli renvoie 32 événements (`OfferPublished`, `OfferOpened`, `OfferAccepted`, `TradeCompleted`, `PaymentRefused`, `OfferWithdrawn`), tous avec un champ `data` vide. | conforme |
| M10 | Les ressources manquantes lors d'un paiement refusé ne sont connues que de l'acheteur concerné | Consultation de l'offre par le vendeur après un paiement refusé | Observé en local : après le refus du paiement de 500 pierre, l'acheteur voit `missing: { stone: 480 }`, et le vendeur, consultant la même offre par `/api/market/offers/<id>`, voit `missing: null`. | conforme |

## Synthèse

- 10 exigences conformes, 0 non conforme, 0 risque accepté.
- Limite relevée par la revue : un message abandonné après dix tentatives ne peut être ni
  examiné ni relancé, et peut laisser une offre bloquée avec des ressources en séquestre ;
  elle est consignée dans le registre de la dette technique (DT-007).
- Actions décidées :
  - tout nouveau gestionnaire de message sera idempotent, et accompagné d'un test de remise
    en double ;
  - toute nouvelle route d'API lira le joueur dans `c.var.userId`, et ne produira de
    mouvement de ressources que par le domaine du module qui le porte.
