# ADR-0011 - La Forge paie ses commandes par une saga orchestrée avec le Village, compensée par un remboursement en cas d'annulation

- Statut : accepté
- Date : 2026-10-23

## Contexte

Une commande de la Forge coûte des ressources, qui appartiennent au village du joueur. La règle
d'encapsulation des modules (TD2) réserve au Village toute décision sur un village : la Forge ne
peut ni lire son stock, ni écrire dans son flux. Une transaction ne modifie jamais les données
que d'un seul module (ADR 0007).

Une commande peut être annulée tant que la pièce n'est pas prête : le joueur doit alors
retrouver les ressources qu'il a payées. Une commande ne doit jamais créer ni détruire de
ressources, quelles que soient les pannes et les messages remis plusieurs fois.

Le Village sait déjà prélever et verser des ressources pour le compte d'un autre module, par
les sujets `realm.withdraw` et `realm.deposit` de ses contrats, avec une adresse de retour et
une clé d'idempotence choisie par le demandeur (TD9).

## Décision

Le paiement d'une commande est une saga orchestrée par la Forge (`domain/saga.ts`,
`application/forge-service.ts`) :

1. `OrderPlaced` demande au Village le prélèvement du coût (`realm.withdraw`), avec l'adresse
   de retour `forge.transfer-result` : c'est l'étape compensable.
2. La réponse du Village enregistre `OrderPaid`, qui fait courir la durée de forge, ou
   `OrderRejected` si le stock ne suffit pas : rien n'a alors été prélevé.
3. `OrderCancelled` demande le remboursement intégral du coût payé (`realm.deposit`) :
   c'est la compensation. Le versement ne peut pas être refusé.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme, dans la même transaction
que les événements qui les déclenchent, et distribués après chaque commande et chaque
consultation de la Forge, ainsi que chaque jour par la tâche planifiée.

Chaque mouvement porte une clé d'idempotence déterminée par la commande :
`forge:<numéro>:pay:<joueur>` et `forge:<numéro>:refund:<joueur>`. Le préfixe `forge` empêche
toute collision avec les mouvements du Marché dans l'historique d'un village ; l'identifiant du
joueur, opaque, est placé en dernier. Côté Forge, le domaine ignore toute réponse qui n'est pas
celle attendue dans l'état courant : doublon, réponse tardive, ou réponse à un remboursement.

Le Village n'est pas modifié : la Forge n'utilise que ses contrats publics.

## Conséquences

### Positives

- Aucune ressource n'est créée ni perdue : un paiement refusé ne prélève rien, une annulation
  rembourse exactement le coût enregistré dans `OrderPlaced`.
- Un message remis deux fois n'a d'effet qu'une fois, de part et d'autre : le Village retient
  les mouvements traités, la Forge ignore les réponses inattendues.
- Le Village sert un deuxième demandeur sans aucune modification : le choix de l'adresse de
  retour (ADR 0007) est confirmé.
- Dans le cas ordinaire, toute la saga se déroule pendant la requête du joueur : la commande
  est déjà à la forge lorsque la réponse lui parvient.

### Négatives

- Un état intermédiaire (« paiement en cours ») est visible du joueur, et l'annulation y est
  refusée, faute de pouvoir rembourser un prélèvement qui n'a peut-être pas eu lieu.
- Si la distribution échoue, la commande reste en paiement jusqu'à la consultation suivante de
  la Forge ou du Marché, ou jusqu'à la tâche quotidienne.
- Chaque consultation de la Forge distribue toute la boîte d'envoi, y compris les messages des
  autres modules (dette technique consignée).
- Le format de l'identifiant de mouvement fait partie du contrat implicite entre la Forge et
  ses gestionnaires : il est vérifié par des tests, mais pas par le typage.

## Alternatives écartées

- **Vérifier le stock avant la commande, en lisant le Village** : la Forge aurait dépendu du code
  ou des tables du Village, et le stock aurait pu changer entre la lecture et le prélèvement.
- **Lire le langage publié du Village dans une projection** : une projection donne un stock
  différé, qui ne permet pas de garantir le paiement.
- **Ajouter au Village une commande « payer une pièce »** : le Village aurait connu la Forge,
  alors que les sujets existants suffisent.
- **Rembourser partiellement l'annulation** : une perte arbitraire de ressources, plus difficile
  à justifier au joueur et à vérifier par un test.

## Réexamen

Cette décision devra être réexaminée si le Village est extrait en service autonome (ADR 0009) :
les messages de la Forge passeraient alors par la boîte de réception, comme ceux du Marché ;
ou si une commande doit mobiliser les ressources de plusieurs joueurs.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition de la saga et d'une première rédaction de cet ADR, sur le
modèle de l'ADR 0007. Les garanties annoncées sont vérifiées par les tests du domaine
(`forge.test.ts`) et de l'API (`forge-api.test.ts`) ; le texte a été relu et validé avant
d'être versionné.
