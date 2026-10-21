# ADR-0007 - Les opérations entre modules sont des sagas orchestrées, dont les messages transitent par une boîte d'envoi transactionnelle

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché modifie les données de trois flux : celui de l'offre, qui appartient au
Marché, et ceux des villages du vendeur et de l'acheteur, qui appartiennent au Village. Il ne
doit ni créer ni perdre de ressources, quelles que soient les pannes et les accès concurrents.

La règle d'encapsulation des modules (TD2) réserve au Village toute décision sur un village :
le Marché ne peut ni écrire dans ses flux, ni dupliquer ses règles de stock et de production.
Le projet prévoit par ailleurs l'extraction d'un module dans un service doté de sa propre
base de données (TD11).

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucun processus de fond ne peut
remettre des messages en continu, et les tâches planifiées de l'offre gratuite ne s'exécutent
qu'une fois par jour.

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga, dont les étapes sont identifiées :
la mise en séquestre des ressources du vendeur est compensable, le prélèvement de l'acheteur
est l'étape pivot, et les versements comme la restitution sont repris jusqu'au succès.

La saga est orchestrée par le module qui porte l'opération, le Marché (`saga.ts`,
`market-service.ts`). Les participants ne connaissent pas la saga : le Village sait seulement
prélever et verser des ressources, et répond à l'adresse de retour (`replyTo`) indiquée dans
chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme (`platform.outbox`), dans
la même transaction que les événements qui les déclenchent.

La distribution est garantie au moins une fois : bail de trente secondes, réservation par
`FOR UPDATE SKIP LOCKED`, nouvel essai avec recul exponentiel, abandon après dix tentatives.

Chaque gestionnaire est idempotent, grâce à une clé d'idempotence choisie par le demandeur
(`<offre>:reserve`, `<offre>:pay-<n>`, `<offre>:refund`) ; un refus est enregistré comme un fait.

La distribution a lieu après chaque commande et chaque consultation du Marché, et chaque jour
par une tâche planifiée de Vercel (`/api/outbox/dispatch`), protégée par le secret
`CRON_SECRET`.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : l'encapsulation est préservée, et
  l'extraction d'un module reste possible.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : aucun message
  n'est perdu, tout message finit par être remis, et un message remis deux fois n'a d'effet
  qu'une fois.
- Le Village peut servir d'autres demandeurs (impôt, récompense) sans modification, grâce à
  l'adresse de retour.
- La boîte d'envoi sert aussi de minuterie : l'échéance des offres repose sur un message
  différé, sans mécanisme supplémentaire.
- Le déroulement de la saga se lit en un seul endroit, la fonction `requestsFor`.
- Dans le cas ordinaire, toute la saga se déroule pendant la requête du joueur.

### Négatives

- Des états intermédiaires sont visibles des joueurs, comme une offre en réservation ou en
  règlement, et l'interface doit savoir les présenter.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation
  suivante du Marché, ou le lendemain par la tâche planifiée.
- Chaque gestionnaire doit être idempotent, et ses doublons doivent être testés : une erreur
  sur ce point crée ou détruit des ressources.
- Les messages abandonnés ne peuvent encore être ni examinés ni relancés par aucun outil
  (dette DT-007) : une offre dont un message est abandonné reste bloquée, ressources en
  séquestre.
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Transaction unique englobant les données des deux modules** : le Marché devrait écrire
  dans les flux du Village et en dupliquer les règles, et l'extraction d'un module deviendrait
  impossible sans réécrire l'échange.
- **Transaction distribuée par validation en deux phases** : peu disponible dans les services
  hébergés, elle rend chaque base dépendante des autres et maintient des verrous pendant toute
  la coordination.
- **Appel direct du Village par le Marché, sans boîte d'envoi** : c'est la double écriture ;
  une panne entre l'enregistrement de l'offre et l'appel laisse une offre bloquée ou des
  ressources disparues.
- **Saga chorégraphiée** : le déroulement serait réparti entre les participants, et le Village
  devrait connaître les événements du Marché, ce qui l'empêcherait de servir d'autres
  demandeurs sans modification.
- **Journal d'événements utilisé comme boîte d'envoi** : un message est une commande adressée à
  un destinataire, non un fait, et sa distribution doit être suivie message par message
  (tentatives, dernière erreur), ce que le point de reprise d'une projection ne permet pas.

## Réexamen

Cette décision devra être réexaminée lors de l'extraction d'un module dans un service distinct,
qui demanderait une boîte d'envoi par base et un transport entre services ; si le volume de
messages justifie un courtier de messages dédié ; ou si un besoin de latence n'est plus
satisfait par une distribution déclenchée par les requêtes des joueurs.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD9. Le texte a été relu, ajusté et validé avant d'être
versionné.
