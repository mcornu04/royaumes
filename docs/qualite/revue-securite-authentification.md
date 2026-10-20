# Revue de sécurité du parcours d'authentification

- Date : 2026-10-20
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API et aux pages du jeu.
- Références : OWASP Top 10, OWASP ASVS.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; documentation de Better Auth | Le test passe : la colonne `identity.account.password` est renseignée et ne contient pas le mot de passe. Better Auth hache avec scrypt (fonction lente et salée). | conforme |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » | `minPasswordLength: 8` ; le test passe (400 pour « court »). Le formulaire impose aussi `minLength={8}`, en simple confort. | conforme |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Sous-partie 2.3 ; configuration de `better-auth.ts` | Limites configurées : 40 inscriptions et 60 connexions par minute et par IP, adaptées à une classe derrière une seule IP ; désactivation impossible sur Vercel. Les compteurs sont toutefois conservés dans la mémoire de chaque instance : la limite réelle est multipliée par le nombre d'instances. Accepté pour ce projet, consigné en DT-004. | risque accepté |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | Le test passe ; le cookie `better-auth.session_token` reçu par curl est marqué `#HttpOnly_`. | conforme |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` | Le test passe : `SameSite=Lax`. | conforme |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comportement en local et en production | En production, le cookie se nomme `__Secure-better-auth.session_token` et porte l'attribut `Secure` : le navigateur ne le transmet que sur HTTPS. En local, sur `http://localhost`, l'attribut est absent, ce qui est sans conséquence puisque la connexion ne quitte pas le poste. | Conforme |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | `git grep BETTER_AUTH_SECRET` ; fonction `resolveSecret` | `git grep` ne trouve que le nom de la variable (`.env.example`, vide, et `better-auth.ts`), jamais une valeur. `resolveSecret` lève une erreur en production sur Vercel si la variable est absente. | conforme |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test « répond de la même manière que l'adresse existe ou non » | Le test passe : même code et même corps de réponse pour une adresse connue avec un mauvais mot de passe et pour une adresse inconnue. | conforme |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Création d'un compte avec une adresse déjà utilisée | Une inscription avec une adresse existante renvoie 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (« Cette adresse est déjà utilisée. ») : l'existence d'un compte est révélée. Accepté : l'utilisateur doit savoir qu'il ne peut pas utiliser cette adresse, le jeu ne conserve aucune donnée sensible et n'envoie aucun courrier qui permettrait de masquer ce cas. | risque accepté |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests « Contrôle d'accès à l'API du Village » ; racine de composition | Les tests passent (401 en lecture et en commande, sans rien enregistrer) ; observé avec curl : 401 `UNAUTHENTICATED`. La protection est déclarée module par module dans `create-api.ts` : un futur module pourrait être oublié. Risque maîtrisé en accompagnant chaque module protégé d'un test de contrôle d'accès. | conforme |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test « isole les villages des joueurs » ; origine de `userId` dans les routes | Le test passe. Le flux est construit à partir de `c.var.userId`, renseigné par `requireUser`, et jamais à partir d'une donnée fournie par le client (ni adresse, ni corps). | conforme |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Mise en page `app/(jeu)/layout.tsx` ; accès à `/village` sans session | Sans session, `/village` répond 307 vers `/login` (redirection serveur, aucune page rendue) ; avec session, 200. Toute page placée dans `app/(jeu)/` hérite de la vérification. | conforme |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Gestionnaire `onError` de la racine de composition | `onError` journalise l'erreur côté serveur et renvoie uniquement `{ code: 'INTERNAL', message: 'Erreur interne' }` (500). | conforme |
| S14 | La déconnexion invalide la session sur le serveur | Réutilisation d'un cookie après déconnexion | Après `sign-out` (200, `success: true`), le même cookie présenté à `/api/realm/village` reçoit 401 : la session n'existe plus en base. | conforme |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | Appel de la déconnexion avec un en-tête `origin` étranger | `sign-out` avec `origin: http://site-malveillant.example` : 403 `INVALID_ORIGIN` ; sans en-tête `origin` : 403 `MISSING_OR_NULL_ORIGIN`. La session reste valide après ces deux refus. | conforme |
| S16 | Un flux temps réel n'est accessible qu'aux joueurs connectés, et seulement pour les canaux auxquels ils ont droit | Tests « réserve le temps réel aux joueurs connectés (401) », « refuse l'écoute du village d'un autre joueur (403) » et « refuse un canal qu'aucune règle ne couvre (403) » ; principe de l'accès fermé par défaut dans `channel-policy.ts` | Un visiteur anonyme reçoit une erreur 401, un joueur qui tente d'écouter le village d'un autre joueur une erreur 403. Un canal sans règle est refusé : l'oubli d'une règle par un module futur rend ses canaux inaccessibles, et non publics. | Conforme |

## Synthèse

- 14 exigences conformes, 0 non conforme, 2 risques acceptés (S3, S9), sur 16 exigences ;
  aucune exigence n'est plus en attente de vérification.
- S6 a été vérifiée en production au TD5 : le cookie porte l'attribut `Secure` en HTTPS.
- S16 a été ajoutée au TD5, le temps réel ayant ouvert une nouvelle voie d'accès aux données.
- Actions décidées :
  - S3 : la limite par instance est consignée dans le registre de la dette technique (DT-004),
    à réexaminer lors de la revue de qualité du TD11.
  - S10 et S16 : chaque nouveau module dont les routes ou les canaux sont réservés aux joueurs
    sera accompagné de tests de contrôle d'accès.
