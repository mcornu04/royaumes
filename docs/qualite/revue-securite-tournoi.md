# Revue de sécurité du Tournoi : équité des combats et intégrité des récompenses

- Date : 2026-10-23
- Périmètre : API du module Tournoi, projection des profils, gestionnaire de messages
  `tournament.award`, versement des récompenses, canal temps réel `tournaments`, données
  personnelles, et lecture des tournois remportés par le Classement.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design,
  A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| T1 | Toutes les routes du Tournoi sont réservées aux joueurs connectés | Test « refuse toute requête anonyme (401) » (`tournament-api.test.ts`) | Le test passe : les six routes répondent 401 sans session ; elles sont protégées par `requireUser` dans `create-api.ts`. | conforme |
| T2 | Un joueur n'ouvre et ne rejoint un tournoi qu'en son propre nom | Test « ignore un identifiant de joueur glissé dans le corps : l'hôte est le joueur connecté » | Le test passe : avec un `playerId` ajouté au corps, l'hôte reste le joueur connecté. Le schéma `EnterTournamentInput` n'accepte que la tactique ; le nom et l'identifiant viennent de `c.var`. | conforme |
| T3 | Les conditions d'entrée sont vérifiées par le serveur, sur des données que le joueur ne fournit pas | Tests « refuse l'ouverture et l'inscription d'un joueur qui ne remplit pas les conditions (403) » et « déduit le profil du joueur des événements du Village et de la Forge » | Les tests passent : un joueur au village de niveau 4 est refusé (`NOT_ELIGIBLE`). Le profil est lu dans `tournament.champions`, tenu par la projection à partir du journal ; aucune caractéristique n'est transmise par le navigateur. | conforme |
| T4 | Seul l'hôte lance son tournoi | Test « réserve le lancement à l'hôte… » | Le test passe : Bob reçoit 403 (`NOT_HOST`) en lançant le tournoi d'Alice. | conforme |
| T5 | Un joueur n'occupe qu'une place dans un tournoi, et un tournoi ne dépasse pas huit places | Règle 2 du domaine ; test « refuse une seconde inscription du même joueur (409)… » | Les tests passent : une seconde inscription est refusée (`ALREADY_JOINED`), un neuvième inscrit aussi (`FULL`), et toute inscription après le lancement (`NOT_OPEN`). La concurrence optimiste du flux empêche deux inscriptions simultanées de dépasser la limite. | conforme |
| T6 | Un joueur n'est engagé que dans un tournoi à la fois | Lecture de `domain/tournament.ts` | Non vérifié par le domaine : chaque tournoi ne connaît que son propre flux, et un joueur peut s'inscrire à plusieurs tournois ouverts, et y être récompensé. Consigné dans le registre de la dette technique (DT-015). | non conforme |
| T7 | Les combats ne peuvent être influencés ni par le joueur, ni par le navigateur | Règles 3 et 5 du domaine (`tournament.test.ts`) ; lecture de `api.ts` | Les tests passent : le tableau ne dépend que de la graine et des caractéristiques figées à l'inscription. La graine est tirée par le serveur au lancement (la route `start` n'a pas de corps), et une fonction d'aptitude interdit au domaine de lire le hasard ou l'horloge lui-même. | conforme |
| T8 | Les récompenses ne sont versées qu'une fois, après la finale, et aux seuls joueurs du podium | Tests « verse une seule fois les récompenses… » (API) et règle 7 du domaine | Les tests passent : aucun versement avant la fin du dernier tour (le rappel est refusé, puis retenté) ; un second rappel ne produit rien ; un chevalier de l'ordinateur ne reçoit rien. Les versements portent les clés d'idempotence `tournament:<id>:champion` et `tournament:<id>:finalist`. | conforme |
| T9 | Le canal global du Tournoi ne transmet aucune donnée d'événement | Test « annonce les tournois sur le canal global du Tournoi, sans aucune de leurs données » | Le test passe : la route de repli renvoie `TournamentOpened` et `EntrantJoined`, tous deux avec un champ `data` vide (`redact: true`). | conforme |
| T10 | L'issue d'un duel n'est connue qu'à la fin de son tour | Règle 6 du domaine ; lecture de `domain/view.ts` | Le vainqueur des duels du tour en cours est masqué (`winner: null`). Les coups de ces duels sont toutefois transmis dès le début du tour, pour que l'arène les rejoue : un joueur qui lit la réponse de l'API connaît l'issue jusqu'à trente secondes à l'avance. Aucune action n'étant possible pendant un tour, cette connaissance ne donne aucun avantage. | risque accepté |
| T11 | Le joueur obtient ses données du Tournoi, et son nom et son profil sont effacés avec son compte | Test « exporte les inscriptions du joueur, puis efface son nom et son profil » | Le test passe : l'export contient le profil et les inscriptions ; après la suppression du compte, le nom est remplacé dans les événements et dans la liste des tournois, et la ligne de `tournament.champions` est supprimée. | conforme |

## Synthèse

- 9 exigences conformes, 1 non conforme (T6), 1 risque accepté (T10).
- Actions décidées :
  - DT-015 : refuser l'inscription d'un joueur déjà engagé dans un tournoi ouvert ou en cours,
    par une vérification dans le modèle de lecture, avant toute ouverture publique du jeu ;
  - toute action future d'un joueur pendant un tour (changement de tactique) imposera de ne plus
    transmettre les coups du tour en cours avant son échéance (T10 serait alors non conforme).
