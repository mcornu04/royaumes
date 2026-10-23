# Rendu de l'évaluation

- Auteur : Mathis Cornuault
- Modules : `forge` (la Forge), `tournament` (le Tournoi) et `quests` (les Quêtes du jour)
- Adresse du déploiement : https://royaumes-one.vercel.app
- Fiches de cadrage : [la Forge](fiche-cadrage-forge.md), [le Tournoi](fiche-cadrage-tournoi.md) et
  [les Quêtes](fiche-cadrage-quetes.md)

Trois modules ont été réalisés. La **Forge** est le module principal de l'évaluation : le joueur
y commande des armes et des armures, payées en ressources de son village par une saga, forgées
pendant une durée propre à chaque recette, puis exposées dans son armurerie. Le **Tournoi** s'y
ajoute : les joueurs dont le village et la forge sont assez avancés s'affrontent, avec des
chevaliers pilotés par l'ordinateur, dans des tournois à élimination directe dont les combats se
déroulent sous leurs yeux. Les **Quêtes du jour** relient l'ensemble : chaque jour, trois
objectifs tirés dans les autres modules, affichés à droite de chaque écran, cochés en temps réel
et récompensés en or.

## Règles métier

### La Forge (`src/modules/forge/domain/`)

| N° | Règle | Tests du domaine (`forge.test.ts`) | Tests de l'API (`forge-api.test.ts`) |
| --- | --- | --- | --- |
| F-R1 | Seules les recettes du catalogue peuvent être commandées ; le coût et la durée sont copiés dans la commande | « Forge - règle 1 » (2 tests) | « refuse une recette absente du catalogue (400) » |
| F-R2 | La forge ne fabrique qu'une pièce à la fois | « Forge - règle 2 » (2 tests) | « refuse une seconde commande tant qu'une pièce est à la forge (409) » |
| F-R3 | Une recette exige un rang suffisant : apprenti, compagnon dès 2 pièces, maître dès 5 | « Forge - règle 3 » (2 tests) | « refuse une recette d'un rang supérieur… (409) » |
| F-R4 | Le coût est prélevé dans le village ; un stock insuffisant refuse la commande sans rien prélever | « Forge - règle 4 » (3 tests) | « prélève le coût dans le village… », « refuse la commande si le village ne peut pas la payer… » |
| F-R5 | La pièce n'est récupérable qu'après sa durée de forge, comptée depuis le paiement (échéance paresseuse) | « Forge - règle 5 » (3 tests) | « ne livre la pièce qu'à son échéance… » |
| F-R6 | Une commande annulée avant la fin de la forge est remboursée intégralement | « Forge - règle 6 » (2 tests) | « rembourse intégralement une commande annulée… », « refuse l'annulation sans commande (404)… » |
| F-R7 | Une pièce récupérée entre dans l'armurerie, avec le poinçon du forgeron, et fait progresser rang et puissance | « Forge - règle 7 » | « ne livre la pièce qu'à son échéance, puis l'ajoute à l'armurerie » |

### Le Tournoi (`src/modules/tournament/domain/`)

| N° | Règle | Tests du domaine (`tournament.test.ts`) | Tests de l'API (`tournament-api.test.ts`) |
| --- | --- | --- | --- |
| T-R1 | Seuls les joueurs dont chaque bâtiment est au niveau 5 et qui ont forgé 2 pièces s'inscrivent ; leurs caractéristiques sont figées à l'inscription | « Tournoi - règle 1 » (3 tests) | « déduit le profil du joueur… », « refuse l'ouverture et l'inscription d'un joueur qui ne remplit pas les conditions (403) », « exige le rang de compagnon de la Forge… » |
| T-R2 | On rejoint un tournoi ouvert, une seule fois, dans la limite de huit places | « Tournoi - règle 2 » (2 tests) | « ouvre un tournoi, inscrit un second joueur… », « refuse une seconde inscription du même joueur (409)… » |
| T-R3 | Seul l'hôte lance le tournoi ; les places vides sont prises par des chevaliers de l'ordinateur tirés au sort | « Tournoi - règle 3 » (2 tests) | « réserve le lancement à l'hôte, et complète le tableau… » |
| T-R4 | Les dégâts dépendent de l'attaque, du dé, de la défense adverse et du triangle des tactiques | « Tournoi - règle 4 » (3 tests) | — (règle pure) |
| T-R5 | Le tableau à élimination directe se déduit de la graine : même graine, même tournoi | « Tournoi - règle 5 » (2 tests) | — (règle pure) |
| T-R6 | Chaque tour dure trente secondes et se dévoile à son échéance, sans tâche de fond | « Tournoi - règle 6 » (3 tests) | « dévoile les tours à leur échéance, puis désigne le champion » |
| T-R7 | Le champion et le finaliste, s'ils sont des joueurs, reçoivent 50 et 20 pièces d'or, une seule fois, après la finale | « Tournoi - règle 7 » (4 tests) | « verse une seule fois les récompenses aux joueurs du podium… » |

### Les Quêtes du jour (`src/modules/quests/domain/`)

| N° | Règle | Tests du domaine (`quests.test.ts`) | Tests de l'API (`quests-api.test.ts`) |
| --- | --- | --- | --- |
| Q-R1 | Chaque jour, trois quêtes par joueur, une facile, une moyenne et une difficile, de trois modules différents, tirées à partir du jour et du joueur | « Quêtes - règle 1 » (2 tests) | « présente trois quêtes à faire, le coffre fermé… » |
| Q-R2 | Une quête avance avec les actions du joueur faites le jour même dans les autres modules | « Quêtes - règles 2 et 3 » | « coche les quêtes à mesure que le joueur agit… Taverne comprise », « ne compte ni l'activité des autres joueurs, ni celle de la veille » |
| Q-R3 | Une quête est cochée dès que son objectif est atteint | « Quêtes - règles 2 et 3 » | « coche les quêtes à mesure que le joueur agit… » |
| Q-R4 | La récompense d'une quête cochée se récupère une seule fois, et seulement le jour même | « Quêtes - règle 4 » (3 tests) | « verse l'or d'une quête accomplie… une seule fois », « refuse une quête non accomplie (409)… (404) », « renouvelle les quêtes à minuit… » |
| Q-R5 | Il faut un village pour recevoir une récompense | « Quêtes - règle 5 » | « refuse la récompense d'un joueur sans village (409) » |
| Q-R6 | Le coffre du jour s'ouvre une fois les trois récompenses récupérées, une seule fois par jour | « Quêtes - règle 6 » (2 tests) | « ouvre le coffre du jour une fois les trois récompenses récupérées, et une seule fois » |

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/forge/`, `src/modules/tournament/` et `src/modules/quests/` : `domain/`, `application/`, `infrastructure/`, `api.ts`, `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` (règles d'encapsulation et de couches) |
| E2 | `src/bootstrap/create-api.ts` (assemblage, `requireUser`, routes), `src/ui/app-shell.tsx` (navigation et colonne des quêtes), `app/(jeu)/forge/`, `app/(jeu)/tournament/`, `app/(jeu)/quests/` | Tous les tests de `forge-api.test.ts`, `tournament-api.test.ts` et `quests-api.test.ts`, qui passent par l'application complète |
| E3 | `forge/domain/forge.ts`, `forge/domain/saga.ts`, `tournament/domain/tournament.ts`, `tournament/domain/combat.ts`, `quests/domain/board.ts`, `quests/domain/quests.ts` : fonctions pures, sans dépendance technique | `forge.test.ts` (17 tests), `tournament.test.ts` (19 tests), `quests.test.ts` (10 tests) ; règle `pure-domain` ; fonction d'aptitude sur l'horloge et le hasard |
| E4 | Forge : journal d'événements, flux `forge-<joueur>`, modèle decider, `withOptimisticRetry` (ADR 0010). Tournoi : journal d'événements, flux `tournament-<id>`, et modèles de lecture dans le schéma `tournament`, créés par `drizzle/0013_tournoi.sql` (ADR 0012). Quêtes : journal d'événements (flux `quests-<joueur>`) et modèles de lecture dans le schéma `quests`, créés par `drizzle/0015_quetes.sql` (ADR 0013) | Fonction d'aptitude « range chaque table dans le schéma… » ; tests de l'API |
| E5 | `forge/api.ts`, `tournament/api.ts`, `quests/api.ts` : joueur lu dans `c.var.userId`, corps validés par Zod (`PlaceOrderInput`, `EnterTournamentInput`) | « refuse toute requête anonyme (401) » (les trois modules) ; « n'agit que sur l'atelier du joueur connecté » ; « ignore un identifiant de joueur glissé dans le corps » (les deux modules) ; 400 sur une recette ou une tactique inconnue |
| E6 | Forge → Village par la boîte d'envoi (`realm.withdraw`, `realm.deposit`, réponses sur `forge.transfer-result`) ; Tournoi : lecture du langage publié du Village et de la Forge, versements par `realm.deposit`, lecture de `PrizesAwarded` par le Classement ; Quêtes : lecture du langage publié de cinq modules, de la Taverne par son point d'entrée, et versements par `realm.deposit` | Saga : « Forge - règle 4 » et « règle 6 », `messages.test.ts` ; Tournoi : « déduit le profil… », « verse une seule fois les récompenses… » ; Classement : « compte les tournois remportés par un joueur… » ; Quêtes : « coche les quêtes à mesure que le joueur agit… Taverne comprise », « verse l'or d'une quête accomplie… » |
| E7 | `forge/personal-data.ts`, `tournament/personal-data.ts`, `quests/personal-data.ts`, déclarés dans `create-api.ts` | « exporte les commandes du joueur, puis efface son nom… » ; « exporte les inscriptions du joueur, puis efface son nom et son profil » ; « exporte l'activité et les récompenses du joueur, puis les efface avec son compte » ; fonction d'aptitude « déclare les données personnelles… » |
| E8 | Voir les tableaux des règles métier ci-dessus : chaque règle a au moins un test du domaine, et chaque route au moins un test de l'API | 321 tests au total (`pnpm verify`) |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` ne sont pas assouplis ; une fonction d'aptitude y est ajoutée | `pnpm lint:archi` : 0 violation ; `architecture.test.ts` : 3 tests |
| E10 | Déploiement Vercel ; migrations 0013, 0014 et 0015 appliquées à Neon par `vercel-build` | Parcours en production (partie 6.2 de l'énoncé) : forge d'une pièce, tournoi complet, quête accomplie et récompensée, export et suppression d'un compte de test |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canaux temps réel propres aux modules : `forge-<joueur>`, réservé au propriétaire de l'atelier ; `tournaments` et `quests`, globaux et discrets (le second coche les quêtes en temps réel, quel que soit l'écran) | `forge/index.ts`, `tournament/index.ts`, `quests/index.ts` | « réserve le canal d'un atelier à son propriétaire » ; « annonce les tournois sur le canal global du Tournoi, sans aucune de leurs données » ; « annonce sur le canal global des Quêtes les actions des autres modules, sans leurs données » | README, section « Temps réel » |
| B2 | Échéances gérées sans tâche de fond : fin de la forge d'une pièce, dévoilement des tours d'un tournoi, et renouvellement des quêtes à minuit ; et une tâche quotidienne propre au Tournoi, qui retire les tournois terminés de la liste | `forge/domain/forge.ts`, `forge/domain/view.ts`, `tournament/domain/view.ts`, `tournament/application/tournament-service.ts` (`purge`) | « Forge - règle 5 » ; « Tournoi - règle 6 » ; « renouvelle les quêtes à minuit… » ; « retire de la liste un tournoi terminé, puis de la table par la tâche quotidienne » | ADR 0010, ADR 0012 ; registre de la dette (DT-016 remboursée) |
| B3 | Chevaliers pilotés par l'ordinateur, selon une IA déterministe (profil et tactique fixes, combats tirés d'une graine), réglée par simulation | `tournament/domain/catalog.ts`, `combat.ts`, `random.ts` | « Tournoi - règles 3, 4 et 5 » | ADR 0012 |
| B4 | Modèles de lecture tenus par des projections, avec point de reprise et version : profils des combattants et liste des tournois ; activité quotidienne des joueurs | `tournament/infrastructure/tournament-projection.ts`, `quests/infrastructure/quests-projection.ts` | « déduit le profil du joueur des événements du Village et de la Forge » ; « ouvre un tournoi… et le présente dans la liste » ; « coche les quêtes à mesure que le joueur agit… » | ADR 0012, ADR 0013, `docs/architecture.md` |
| B5 | Saga avec étape compensable entre la Forge et le Village : prélèvement à la commande, remboursement à l'annulation | `forge/domain/saga.ts`, `forge/application/forge-service.ts`, `forge/messages.ts` | « Forge - règles 4 et 6 » ; « rembourse intégralement une commande annulée… » ; `messages.test.ts` | ADR 0011, diagramme de séquence de `docs/architecture.md` |
| B6 | Communication avec plusieurs modules existants : le Tournoi avec le Village, la Forge et le Classement ; les Quêtes avec six modules (Village, Forge, Donjon, Tournoi, Marché par leur langage publié ; Taverne par son point d'entrée ; Village pour les versements) | `tournament-projection.ts`, `tournament-service.ts`, `ranking/infrastructure/ranking-projection.ts`, `quests-projection.ts`, `quests-service.ts` | « déduit le profil… » ; « verse une seule fois les récompenses… » ; « compte les tournois remportés par un joueur, et non ceux des chevaliers » ; « coche les quêtes à mesure que le joueur agit dans les autres modules, Taverne comprise » | ADR 0012, ADR 0013, `docs/architecture.md` |
| B8 | Nouvelle fonction d'aptitude : aucun domaine ne lit l'horloge ni le hasard, ce qui protège l'échéance de la Forge et la reproductibilité des tournois | `src/bootstrap/architecture.test.ts` | « ne laisse aucun domaine lire l'horloge ni le hasard… » (contre-épreuve faite : un `Date.now()` ajouté au domaine de la Forge fait échouer le test) | `docs/architecture.md`, section des règles vérifiées |

## Écarts avec la fiche de cadrage

- Une fiche de cadrage a été rédigée pour chacun des trois modules ; leurs règles métier sont
  celles des tableaux ci-dessus, numérotées F-R1 à F-R7, T-R1 à T-R7 et Q-R1 à Q-R6 dans le même
  ordre.
- Quêtes, temps réel : le tableau devait d'abord se relire à chaque changement de page ; un canal
  global (`quests`) a été ajouté pendant la réalisation, pour qu'une quête se coche dès l'action,
  y compris sans changer d'écran.
- Le Tournoi est un second module, ajouté à la Forge : il s'appuie sur elle (rang de compagnon)
  et sur le Village (niveau 5 des bâtiments).
- Tournoi, tâche quotidienne : ajoutée pendant la réalisation pour rembourser la dette DT-016
  (tournois terminés jamais retirés de la liste) ; elle ne change aucune règle métier.
- Évolutions de l'existant, toutes passées par les contrats ou consignées : une constante
  exportée par les contrats du Village (`STARTING_LEVELS`) ; la projection du Classement en
  version 3, avec une migration de son propre schéma (`0014_classement_tournois.sql`) et une
  colonne « Tournois » (ADR 0012) ; une fonction de lecture exposée par le point d'entrée de la
  Taverne pour les Quêtes (ADR 0013) ; le cadre du jeu (`AppShell`), qui reçoit la colonne des
  quêtes et regroupe le compte du joueur dans un menu ; un habillage graphique commun, limité à
  `app/globals.css` ;
  et la mise à jour de Next.js en 16.4.2, pour corriger trois vulnérabilités signalées par la
  construction.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 321 |
| Couverture des lignes | 75 % | 72,5 % (domaines 99,7 % ; Forge 99,3 %, Tournoi 97,1 % et Quêtes 90,8 % hors écrans) |
| Violations des règles d'architecture | 0 | 0 |
| Fonctions d'aptitude | 2 | 3 |
| ADR | 9 | 13 |

## Usage de l'IA générative

Claude Code (Anthropic) a été utilisé pendant tout le travail, comme assistant de conception et
de programmation :

- **Conception** : propositions de modules, de règles, de stockage et de bonus, discutées puis
  validées avant toute réalisation (recettes et rangs de la Forge, conditions d'entrée et
  récompenses du Tournoi, catalogue et récompenses des Quêtes).
- **Code et tests** : écriture du domaine, des services, des API, des écrans et des tests, sur
  le modèle des modules des TD. L'équilibre du Tournoi a été réglé par des simulations de
  1 500 tournois par profil, dont les résultats sont reportés dans l'ADR 0012.
- **Documents** : première rédaction des ADR, des revues de sécurité, du bilan et de ce rendu.

Vérification : chaque étape a été relue avant d'être enregistrée ; `pnpm verify` (Biome,
TypeScript, dependency-cruiser, tests) a été exécuté avant chaque commit ; les règles de sécurité
et les fonctions d'aptitude ont fait l'objet de contre-épreuves (une violation volontaire doit
faire échouer la vérification) ; chaque module a été essayé dans le navigateur, et en production
après déploiement.
