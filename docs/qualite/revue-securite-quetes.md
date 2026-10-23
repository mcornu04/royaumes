# Revue de sécurité des Quêtes du jour : intégrité des récompenses

- Date : 2026-10-23
- Périmètre : API du module Quêtes, projection de l'activité, lecture de la Taverne, versement
  des récompenses au Village, canal temps réel `quests`, données personnelles.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design,
  A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| Q1 | Toutes les routes des Quêtes sont réservées aux joueurs connectés | Test « refuse toute requête anonyme (401) » (`quests-api.test.ts`) | Le test passe : les trois routes répondent 401 sans session ; elles sont protégées par `requireUser` dans `create-api.ts`. | conforme |
| Q2 | Un joueur ne lit et ne récompense que son propre tableau | Lecture de `api.ts` ; test « ne compte ni l'activité des autres joueurs, ni celle de la veille » | Aucune route n'accepte d'identifiant de joueur : `api.ts` lit toujours `c.var.userId`. Le test passe : les actions de Bob ne font pas avancer les quêtes d'Alice. | conforme |
| Q3 | Une récompense n'est versée que pour une quête réellement accomplie | Test « refuse une quête non accomplie (409)… » ; règles 2 et 3 du domaine | Le test passe (`NOT_COMPLETED`). L'avancement est calculé par le serveur, à partir du journal et de la table de la Taverne : le navigateur n'en fournit aucune donnée. | conforme |
| Q4 | Une récompense n'est versée qu'une fois, même par deux requêtes simultanées | Test « verse l'or d'une quête accomplie au village du joueur, une seule fois » ; règle 4 du domaine | Le test passe : une seconde récupération reçoit 409 et l'or du village ne change pas. Deux requêtes simultanées s'excluent par la concurrence optimiste du flux du joueur, et le versement porte une clé d'idempotence (`quest:<jour>:<quête>:<joueur>`). | conforme |
| Q5 | Le joueur ne choisit pas ses quêtes, et ne récupère pas celles d'un autre jour | Tests « refuse une quête… qui n'est pas du jour (404) » et « renouvelle les quêtes à minuit… » ; règle 1 du domaine | Les tests passent : un identifiant de quête inventé, ou une quête de la veille absente du tableau du jour, est refusé (`QUEST_NOT_TODAY`). Le tirage est fait par le serveur, à partir du jour et du joueur. | conforme |
| Q6 | Le coffre du jour ne s'ouvre qu'après les trois récompenses, et une seule fois | Test « ouvre le coffre du jour une fois les trois récompenses récupérées, et une seule fois » | Le test passe : 409 avant les trois récompenses (`CHEST_LOCKED`) et pour une seconde ouverture (`ALREADY_OPENED`). | conforme |
| Q7 | L'or n'est versé qu'à un village existant | Test « refuse la récompense d'un joueur sans village (409) » | Le test passe (`NO_VILLAGE`) : aucun versement n'est demandé pour un village absent, qui finirait en lettre morte dans la boîte d'envoi. | conforme |
| Q8 | Le canal global des Quêtes ne transmet aucune donnée d'événement | Test « annonce sur le canal global des Quêtes les actions des autres modules, sans leurs données » | Le test passe : Bob reçoit l'annonce d'une pièce récupérée par Alice, avec un champ `data` vide (`redact: true`) : ni la pièce, ni le joueur. | conforme |
| Q9 | Le joueur obtient ses données des Quêtes, et son activité est effacée avec son compte | Test « exporte l'activité et les récompenses du joueur, puis les efface avec son compte » | Le test passe : l'export contient l'activité et les récompenses ; après la suppression du compte, l'activité est vide. | conforme |
| Q10 | Les récompenses ne peuvent pas être obtenues sans jouer réellement | Lecture du catalogue et des modules lus | Certaines quêtes faciles s'accomplissent par une action sans coût : publier puis retirer une offre (ses ressources sont restituées), ou écrire un message. Le gain est borné par le tirage : au plus trois quêtes et un coffre par jour, soit 160 pièces d'or au maximum (20 + 30 + 60, et 50 pour le coffre). Accepté pour ce projet. | risque accepté |
| Q11 | L'activité quotidienne, donnée de comportement, n'est pas conservée plus que nécessaire | Lecture de la projection et des tâches quotidiennes | Seule l'activité du jour sert aux quêtes, mais celle des jours passés n'est jamais retirée de la table. Consigné dans le registre de la dette technique (DT-018). | non conforme |

## Synthèse

- 9 exigences conformes, 1 non conforme (Q11), 1 risque accepté (Q10).
- Limite relevée par la revue : chaque action d'un joueur fait relire le tableau de tous les
  joueurs connectés (DT-017).
- Actions décidées :
  - DT-018 : retirer chaque jour, par la tâche quotidienne, l'activité des jours passés, avant
    toute ouverture publique du jeu ;
  - toute nouvelle quête s'appuiera sur une action dont le serveur est seul juge, et jamais sur
    une donnée transmise par le navigateur.
