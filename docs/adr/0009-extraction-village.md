# ADR-0009 - L'extraction du Village en service autonome est préparée, mais le service n'est pas déployé

- Statut : accepté
- Date : 2026-10-21

## Contexte

L'ADR 0001 a retenu un monolithe modulaire, avec une promesse : des frontières entre modules
assez strictes pour qu'un module puisse être extrait dans un service autonome, en remplaçant
des appels internes par des échanges réseau, sans démêler le code.

Les raisons d'extraire un module sont connues : montée en charge indépendante, autonomie des
équipes, cadence de déploiement propre, isolation des pannes et des failles, technologie
différente. Aucune ne s'applique aujourd'hui au jeu, développé par une seule personne et joué
par quelques dizaines de joueurs. Une extraction a en revanche un coût fixe : latence réseau,
pannes partielles, absence de transaction commune, deux déploiements à exploiter, échanges
à authentifier.

Le Village est le meilleur candidat : son domaine ne dépend d'aucun autre module, il ne lit les
données d'aucun autre module, et sa relation avec le Marché passe déjà par les messages de la
saga (ADR 0007). L'inventaire de ses dépendances en fait apparaître deux qui ne passent pas par
le code, et qu'aucune règle de dependency-cruiser ne signale : le Classement et le canal temps
réel du village lisent ses événements directement dans le journal commun (langage publié,
ADR 0006).

## Décision

Le Village peut s'exécuter dans un service autonome (`src/services/village/`), doté de sa
propre base, de son propre journal et de sa propre boîte d'envoi.

L'application devient alors une passerelle : la racine de composition reçoit une version
distante du module Village (`createRemoteRealmModule`), de même forme que la version exécutée
dans le processus ; le reste de l'application ne voit pas la différence (motif de l'étrangleur).

Les messages de la saga franchissent la frontière par une boîte de réception
(`platform/outbox/inbox-api.ts`), sans modifier les garanties de la boîte d'envoi : un message
n'est marqué comme traité qu'à la réception d'une réponse de succès, et il est retenté sinon.

Un relais recopie le flux d'événements publié par le service (`GET /events`) dans le journal de
l'application, où le Classement et le canal temps réel continuent de le lire sans modification.
Il est déclenché après chaque commande du Village, après chaque message de la saga, et chaque
jour par la tâche quotidienne ; il est idempotent.

Les échanges entre les deux processus sont authentifiés par un secret partagé
(`SERVICE_SECRET`), qui n'est jamais versionné.

Le service n'est pas déployé : en production, ni `REALM_SERVICE_URL` ni `SERVICE_SECRET` ne
sont définies, et le Village s'exécute dans l'application.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : il s'exécute dans un
  second processus sans qu'aucun autre module ne soit modifié.
- Six tests de contrat (`src/bootstrap/village-service.test.ts`) vérifient ces frontières à
  chaque construction, y compris la reprise de la saga après une panne du service.
- L'extraction est réversible sans migration de données : relancée seule, l'application
  retrouve les villages créés pendant l'extraction, dont le relais a déposé une copie complète
  dans son journal.
- La boîte de réception, l'authentification entre services et le point de reprise du relais
  appartiennent à la plateforme, et serviraient tels quels à l'extraction d'un autre module.
- Le coût réel d'une extraction est mesuré : environ 150 lignes pour le module distant, 80 pour
  le service, et une panne partielle observée, au cours de laquelle la Taverne, le Marché et le
  Classement continuent de répondre.

### Négatives

- Deux chemins d'exécution du Village sont à maintenir, l'un dans le processus, l'autre
  distant ; toute évolution de son API doit être reportée dans la passerelle.
- Les événements du Village sont copiés dans le journal de l'application ; cette copie n'est
  plus la source de vérité, et sa cohérence est différée.
- Des raccourcis doivent être remboursés avant tout déploiement du service : ses migrations,
  la pagination de son flux publié et la distribution périodique de sa boîte d'envoi
  (registre de la dette technique, DT-010 à DT-012).
- Le secret partagé authentifie les deux sens, et sa fuite permettrait de se faire passer pour
  n'importe quel joueur auprès du service.
- Les données existantes ne sont pas migrées : avant une extraction réelle, les flux `village-`
  de la base de l'application devraient être copiés dans celle du service.

## Alternatives écartées

- **Déployer le service** : un second déploiement, une seconde base et un second ensemble de
  secrets à exploiter, sans aucun des bénéfices qui le justifieraient.
- **Ne pas extraire** : les frontières resteraient une hypothèse, que rien ne vérifierait ; les
  deux dépendances qui ne passent pas par le code seraient restées ignorées.
- **Lecture à distance du flux publié par le Classement et le canal temps réel** : le moteur des
  projections et le canal temps réel auraient dû savoir lire deux sources, ce qui modifiait la
  plateforme et le Classement ; le relais les laisse inchangés.
- **Extraire le Marché** : sa saga lie son sort à celui du Village ; il dépend du Village pour
  chaque échange, alors que le Village ne dépend de personne.
- **Jeton signé (JWT) ou TLS mutuel** pour authentifier les échanges : plus robustes face à une
  fuite, mais disproportionnés pour un service exécuté sur le poste de développement.

## Réexamen

Cette décision devra être réexaminée si le test de charge du Village dépasse le budget de
performance (`perf/budget.json`) alors que les autres modules le respectent ; si une seconde
équipe est chargée du Village ; si le Village doit être déployé plus souvent que le reste du
jeu ; ou si une panne du Village doit pouvoir être isolée du reste du jeu en production.

## Usage de l'IA générative

Claude Code (Anthropic) : proposition d'une première rédaction de cet ADR à partir des
éléments imposés par le support du TD11 et des résultats de la démonstration à deux processus.
Le texte a été relu, ajusté et validé avant d'être versionné.
