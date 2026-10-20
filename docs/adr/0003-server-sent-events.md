# ADR-0003 - Server-Sent Events, alimentés par le journal d'événements, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger la page : d'abord entre
les onglets ou les appareils d'un même joueur pour son village, puis entre les participants
d'une même partie du Donjon (TD6).

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP authentifiées par
le cookie de session (TD4) et validées par les modules. Seul le sens serveur vers navigateur
manque.

L'hébergement impose ses contraintes : la durée d'exécution d'une fonction Vercel est
plafonnée (300 secondes dans la configuration retenue), plusieurs instances peuvent traiter
les requêtes sans partager de mémoire, et l'offre gratuite exclut toute infrastructure
supplémentaire permanente.

Le projet dispose d'un journal d'événements dont chaque flux porte des versions croissantes
et uniques (ADR 0002).

## Décision

Les changements sont diffusés aux navigateurs par des Server-Sent Events, sur la route
`/api/stream/<canal>` (`src/platform/realtime/stream-api.ts`).

Un canal correspond exactement à un flux du journal. L'identifiant de chaque message SSE est
la version de l'événement : après une interruption, le navigateur renvoie l'en-tête
`Last-Event-ID`, et le flux reprend aux événements postérieurs à cette version.

Le flux relit le journal toutes les demi-secondes, sans aucun état en mémoire. Il se ferme
de lui-même au bout de 240 secondes, sous la limite de Vercel, et le navigateur s'y
reconnecte après le délai indiqué par le champ `retry`.

L'accès est réservé aux joueurs connectés (`requireUser`), et chaque module déclare la règle
d'accès à ses canaux (`ChannelPolicy`) ; un canal qu'aucune règle ne couvre est refusé.

L'interface relit sa vue auprès de l'API à chaque notification (`useChannel`), plutôt que
d'appliquer elle-même le contenu des événements.

## Conséquences

### Positives

- Les SSE sont du HTTP ordinaire : ils fonctionnent sur l'hébergement sans serveur,
  traversent proxys et pare-feu, et bénéficient de l'authentification par cookie existante.
- La reconnexion et la reprise sont natives (`EventSource`, `Last-Event-ID`) : aucun
  événement n'est perdu ni reçu deux fois après une interruption ou une fermeture volontaire.
- Le flux ne conserve rien en mémoire : n'importe quelle instance peut servir n'importe quel
  joueur, et la fermeture à 240 secondes est transparente pour lui.
- Le journal reste la source unique des notifications : aucune table ni aucun service
  supplémentaire.
- L'interface affiche toujours la vue calculée par le serveur ; un canal pourra ne transmettre
  qu'un signal, sans donnée, lorsque des informations doivent rester cachées (TD6).
- L'accès fermé par défaut rend inaccessibles, et non publics, les canaux d'un module qui
  aurait oublié de déclarer sa règle.

### Négatives

- Chaque joueur connecté provoque deux lectures du journal par seconde : la charge de la
  base croît linéairement avec le nombre de joueurs connectés.
- Un événement peut être reçu jusqu'à une demi-seconde après son enregistrement, auquel
  s'ajoute la durée de relecture de la vue par l'interface.
- Chaque fermeture volontaire provoque une reconnexion, toutes les quatre minutes environ,
  pendant laquelle les notifications sont retardées d'environ une seconde.
- Chaque flux occupe une fonction Vercel pendant toute sa durée, ce qui consomme le quota
  d'exécution de l'offre gratuite.
- La communication est unidirectionnelle : un besoin d'envoi très fréquent du navigateur
  vers le serveur ne pourrait pas emprunter ce canal.

## Alternatives écartées

- **WebSocket** : connexion bidirectionnelle permanente, que les fonctions Vercel ne savent
  pas maintenir (prise en charge expérimentale lors de la conception, durée plafonnée). Elle
  aurait exigé un serveur permanent supplémentaire, hors des critères du projet.
- **Interrogation périodique par le navigateur** : compromis défavorable entre le nombre de
  requêtes inutiles et le délai de réception, et une requête HTTP complète, authentifiée,
  à chaque intervalle et pour chaque onglet. Elle reste disponible en repli
  (`/api/stream/<canal>/events?after=`).
- **Notification partagée entre instances** (`LISTEN/NOTIFY` de PostgreSQL, Redis ou un
  service de messagerie) : elle supprimerait la relecture périodique, mais exige une
  connexion permanente ou une infrastructure supplémentaire, injustifiées pour le nombre de
  joueurs du projet.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément rend
la charge des lectures du journal sensible pour la base, si un besoin de communication du
navigateur vers le serveur à très faible délai apparaît, ou si l'hébergeur offre une prise
en charge stable des WebSocket ou d'un mécanisme de notification partagé.

## Usage de l'IA générative

Pour la base des idées.