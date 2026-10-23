# Bilan technique de Royaumes

- Date : 2026-10-21, mis à jour le 2026-10-23 pour l'évaluation
- Version examinée : étiquette `eval-fin` (comparée à l'étiquette `td11-fin`)
- Auteur : Mathis Cornuault

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 9 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system`, et pour l'évaluation `forge`, `tournament` et `quests` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` ; un service extrait, `services/village` |
| Lignes de code, hors tests | 13 925 (`src/` et `app/`), contre 8 363 à `td11-fin` |
| Fichiers de test, nombre de tests | 40 fichiers, 321 tests, contre 33 fichiers et 232 tests à `td11-fin` |
| Commits | 79 à l'étiquette `td11-fin` ; ceux de l'évaluation par `git log --oneline td11-fin..eval-fin` |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093, dont 149 pour le module distant (`remote.ts`) |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 678 |
| `system` | Aucun | 73 |
| `forge` | Event Sourcing, saga avec le Village | 1 240, dont 313 pour l'écran |
| `tournament` | Event Sourcing, projection des profils et des tournois | 2 035, dont 641 pour l'écran |
| `quests` | Event Sourcing (récompenses), projection de l'activité des autres modules | 1 268, dont 351 pour le tableau |

Le Classement compte désormais 492 lignes : sa projection lit aussi les tournois remportés.

Les briques de la plateforme comptent de 33 lignes (`cron`) à 308 (`outbox`) ; le service
Village extrait en compte 82. Valeurs obtenues par la boucle `git ls-files … | wc -l` du
TD11, sur chaque répertoire de `src/modules/`, `src/platform/` et `src/services/`.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | A tenu : hors racine de composition, les autres modules n'importent du Village que des constantes, des types et des schémas (`contracts.ts`) ; l'extraction n'a modifié aucun autre module. Prix : deux dépendances invisibles dans le code (Classement, canal temps réel), traitées par un relais. |
| 0002 | Event Sourcing pour le Village | Ajout des projections du Classement (TD8) ; effacement d'un compte (TD10) ; relais du flux publié (TD11) | A tenu : le Classement a été construit à partir d'événements existants, sans modifier le Village. Prix : l'effacement a exigé une exception à l'ajout seul, encadrée par l'ADR 0008. |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets du Donjon (TD6), canal global du Classement (TD8), source propre de la Taverne (TD10), copies relayées (TD11) | A tenu : chaque nouveau besoin a été couvert par une extension (`redact`, `authorize`, `ChannelSource`) sans changer le principe. Prix non mesuré : la lecture du journal deux fois par seconde et par joueur connecté (risque 1). |
| 0004 | Manches simultanées et échéances paresseuses | Échéance d'exploration ajoutée au TD7 (DT-006) | A tenu : la nouvelle échéance a réutilisé le même mécanisme, sans tâche de fond. |
| 0005 | Intelligence artificielle déterministe | Simulation de parties (`scripts/simulate-dungeon.ts`, TD7) | A tenu : le hasard initialisé par une graine rend chaque partie rejouable ; la simulation a servi à régler l'équilibre (`MONSTER_ATTACK_BONUS`). |
| 0006 | CQRS et projections rattrapées à la lecture | Nouvelle version d'une projection (`bestLoot`, TD8) ; test de charge (TD11) | A tenu, et a été corrigée : la mesure a montré que chaque lecture payait une transaction d'écriture même sans rien à rattraper ; le chemin rapide `isUpToDate` a augmenté le débit des lectures concernées de 36 à 57 % (`perf/avant.json`, `perf/apres.json`). |
| 0007 | Saga orchestrée et boîte d'envoi | Panne partielle du service Village (TD11) | A tenu : la saga reprend après le rétablissement du service, sans code supplémentaire (test de contrat « reprise après une panne »). La limite des messages abandonnés (DT-007) a été remboursée. |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Extraction du Village (TD11) | A tenu : la fonction de réécriture du Village, devenue `redactVillageEvent`, s'applique aussi aux copies relayées ; la présence de `personal-data.ts` dans chaque module est désormais vérifiée par une fonction d'aptitude. |
| 0009 | Extraction du Village, préparée mais non déployée | Aucune encore : démonstration locale à deux processus | Décision récente ; ses conditions de réexamen sont des signes observables (budget de performance, équipe, cadence de déploiement). |
| 0010 | Atelier de la Forge dans le journal, échéance paresseuse | Lecture de l'armurerie par le Tournoi (évaluation) | A tenu : le Tournoi lit `ItemCollected` sans dépendre du code de la Forge, et aucune migration n'a été nécessaire. |
| 0011 | Paiement de la Forge par une saga avec le Village | Ajout d'un deuxième demandeur au Village | A tenu : le Village n'a pas été modifié, ce qui confirme le choix de l'adresse de retour de l'ADR 0007 ; la compensation rembourse le stock à l'identique. |
| 0012 | Tournoi alimenté par le langage publié, combats déduits d'une graine | Réglage de l'équilibre par simulation ; ajout des tournois au Classement | A tenu, au prix d'une modification consignée du Classement (projection en version 3, colonne ajoutée par une migration de son schéma) et d'une constante de plus dans les contrats du Village. |
| 0013 | Quêtes du jour alimentées par l'activité des autres modules | Tableau mis à jour en temps réel depuis n'importe quel écran | A tenu : cinq modules lus sans modification, la Taverne par une seule fonction de son point d'entrée ; prix : un canal global qui fait relire tous les tableaux (DT-017). |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 321 tests réussis (232 à `td11-fin`) ; domaines couverts à 99,7 % des lignes (658 sur 660) | Satisfaisante : les règles du jeu, dont les sept règles de la Forge, les sept du Tournoi et les six des Quêtes, sont vérifiées sans base ni réseau. |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 619 (Marché) à 983 (Taverne) requêtes par seconde, p99 de 40 à 64 ms sous 20 connexions ; budget (`perf/budget.json` : p99 < 500 ms, 0 erreur) respecté (`perf/apres.json`) | Satisfaisante localement ; la mesure, faite avec PGlite, ne prédit pas les performances sur Vercel et Neon, elle ne sert qu'à comparer. |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Concurrence optimiste, remise en double, acceptations simultanées et reprise après panne testées ; messages abandonnés signalés et relançables (`scripts/dead-letters.ts`) | Satisfaisante : aucune ressource n'est créée ni perdue, même lors d'une panne du service extrait. |
| Sécurité | Exigences des revues de sécurité | 72 exigences : 64 conformes, 6 risques acceptés, 2 non conformes (section 5) ; 40 exigences et aucune non conforme à `td11-fin` | Satisfaisante ; les deux non-conformités (T6, inscription à plusieurs tournois ; Q11, activité des jours passés conservée) sont consignées en DT-015 et DT-018. |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles de dépendance, 0 violation (inchangé) ; 3 fonctions d'aptitude (2 à `td11-fin`) ; 72,5 % des lignes couvertes, contre 75 % à `td11-fin` (`pnpm test:coverage`) | Satisfaisante pour le code serveur (modules 93,5 % ; Forge 99,3 %, Tournoi 97,1 % et Quêtes 90,8 % hors écrans ; plateforme 88 %). La baisse de la couverture globale vient des nouveaux écrans : l'interface (558 lignes) reste couverte par aucun test automatique, et a été vérifiée à la main. |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village exécuté dans un second processus, avec sa propre base ; PGlite en local, Neon en production, selon `DATABASE_URL` | Démontrée : l'extraction est réversible sans migration, et la production fonctionne sans le service. |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 18 (12 à `td11-fin`) |
| Entrées remboursées, dont à l'échéance prévue | 8, toutes à l'échéance prévue ou avant (DT-001 à DT-007, et DT-016 dès l'évaluation) |
| Entrées ouvertes | 10 : DT-008 et DT-009 (revue de conformité), DT-010 à DT-012 (service extrait), DT-013 (Forge), DT-014 et DT-015 (Tournoi), DT-017 et DT-018 (Quêtes) |

Analyse : les sept premières entrées ont toutes été remboursées au TD prévu, ce qui montre que
le registre a été un outil de pilotage, et non un simple inventaire : chaque raccourci a été
signalé dans le code, daté, puis traité. Deux entrées font exception : DT-008 (sessions
expirées jamais supprimées) et DT-009 (erreurs complètes dans les journaux), relevées par la
revue de conformité du TD10 avec une échéance au TD11, n'ont pas été remboursées ; leur
échéance a été reportée avant toute ouverture publique du jeu, qui les rendrait bloquantes.
Les trois autres entrées ouvertes concernent le service extrait, qui n'est pas en production :
elles n'ont d'effet qu'en cas de déploiement, et l'ADR 0009 en fait une condition préalable.
Les six entrées ajoutées pour l'évaluation sont des raccourcis délibérés de la Forge, du Tournoi
et des Quêtes, signalés dans le code dès leur écriture ; leur échéance est un signe observable (charge,
nombre de tournois, ouverture publique), et non un TD. L'une d'elles, DT-016 (tournois terminés
jamais retirés de la liste), a été remboursée avant le rendu, par une tâche quotidienne propre
au Tournoi. Aucune dette n'a été découverte par
hasard : toutes proviennent d'une revue ou d'un choix délibéré.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 14 | 2 risques acceptés (S3, S9) | Aucune : l'action de S3 (DT-004) a été remboursée au TD11 |
| Sécurité du Donjon | 14 | 13 | 1 risque accepté (D14) | Aucune ; une règle permanente (tout nouveau champ d'état ajouté explicitement à la vue) |
| Sécurité du Marché | 10 | 10 | 0 | Aucune : l'action de la limite des messages abandonnés (DT-007) a été remboursée au TD11 |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 risque accepté (R10) | DT-008 (R8) et DT-009 (R9), inscrites au registre de la dette |
| Sécurité de la Forge | 10 | 9 | 1 risque accepté (F10) | Aucune non conforme ; limite DT-013 inscrite au registre |
| Sécurité du Tournoi | 11 | 9 | 1 non conforme (T6), 1 risque accepté (T10) | DT-015 (T6), inscrite au registre de la dette |
| Sécurité des Quêtes | 11 | 9 | 1 non conforme (Q11), 1 risque accepté (Q10) | DT-018 (Q11), inscrite au registre de la dette |

Chaque action ouverte figure dans le registre de la dette technique.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | La charge des flux temps réel croît avec le nombre de joueurs connectés : chaque flux relit le journal deux fois par seconde (ADR 0003) | Temps de réponse de la base Neon qui augmente aux heures d'affluence, sans hausse du nombre de commandes ; consommation de calcul Neon proche du quota | Mesurer la charge avec un test qui ouvre des flux simultanés ; si besoin, mutualiser la lecture du journal entre les flux d'une même instance, ou passer à une notification par la base (`LISTEN/NOTIFY`) |
| 2 | La croissance du journal allonge la reconstruction des projections et l'effacement d'un compte, qui le parcourent en entier (ADR 0006 et 0008) | Durée d'une reconstruction ou d'un effacement qui approche la durée maximale d'une fonction Vercel | Indexer les flux par joueur pour l'effacement ; reconstruire les projections hors des requêtes des joueurs, par une tâche dédiée |
| 3 | L'interface n'est vérifiée par aucun test automatique, alors qu'elle porte désormais l'arène et le tableau du Tournoi ; deux dettes de conformité et une non-conformité du Tournoi restent ouvertes (DT-008, DT-009, DT-015) | Une régression signalée par un joueur avant d'être vue par un test ; toute ouverture du jeu à des joueurs extérieurs | Écrire un test de bout en bout (Playwright) d'un tournoi et d'un échange au Marché ; rembourser DT-008, DT-009 et DT-015 avant toute ouverture publique |
| 4 | Le Tournoi, les Quêtes et le Classement dépendent du nom et des données d'événements d'autres modules (langage publié), sans vérification par le typage | Un événement d'un module renommé : profils, quêtes ou classement qui cessent d'évoluer, sans erreur | Ajouter un test de contrat par événement publié lu par un autre module, comme ceux du service Village extrait |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression pour son code serveur : ses règles sont
vérifiées par 321 tests, ses frontières par dependency-cruiser et trois fonctions d'aptitude,
et chaque construction de production exécute ces vérifications. Ses décisions sont consignées
dans treize ADR, dont la plupart ont été éprouvées par une évolution ultérieure. L'extraction du
Village, puis l'ajout de la Forge, du Tournoi et des Quêtes sans modification du Village (hors une
constante de ses contrats), ni de la Taverne (hors une fonction de lecture), ont démontré que ses frontières entre modules sont réelles. Trois conditions demeurent :
ajouter un test automatique de l'interface avant toute évolution importante de celle-ci,
rembourser les dettes DT-008 et DT-009 avant d'ouvrir le jeu au public, et mesurer la charge
des flux temps réel avant d'augmenter sensiblement le nombre de joueurs.

## Usage de l'IA générative

Claude Code (Anthropic) : relevé des indicateurs (tailles, couverture, comptes de la dette et
des revues) par les commandes du support du TD11, et proposition d'une première rédaction de
ce bilan et de sa mise à jour pour l'évaluation. Chaque valeur renvoie à une commande, à une mesure du répertoire `perf/` ou à un
document du dépôt ; le texte a été relu, ajusté et validé avant d'être versionné.
