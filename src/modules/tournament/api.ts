import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { CommandResult, TournamentService } from './application/tournament-service'
import { EnterTournamentInput, type TournamentError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<TournamentError['code'], 403 | 404 | 409> = {
  NOT_ELIGIBLE: 403,
  ALREADY_EXISTS: 409,
  TOURNAMENT_NOT_FOUND: 404,
  NOT_OPEN: 409,
  ALREADY_JOINED: 409,
  FULL: 409,
  NOT_HOST: 403,
  NOT_FINISHED: 409,
}

/**
 * Sous-application Hono du module Tournoi, montée sur /api/tournament.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createTournamentApi(service: TournamentService) {
  return (
    new Hono<AppEnv>()
      // Admission du joueur connecté : profil, caractéristiques et conditions manquantes.
      .get('/eligibility', async (c) => c.json(await service.eligibility(c.var.userId)))

      // Tournois les plus récents.
      .get('/tournaments', async (c) => c.json(await service.list()))

      // Ouverture d'un tournoi : le joueur en est l'hôte et le premier inscrit.
      .post('/tournaments', validateJson(EnterTournamentInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const { tournamentId, result } = await service.open(player, c.req.valid('json').tactic)
        return result.ok
          ? c.json({ tournamentId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Vue d'un tournoi : inscrits, tours dévoilés et champion.
      .get('/tournaments/:id', async (c) => {
        const view = await service.getView(c.req.param('id'), c.var.userId)
        return view
          ? c.json({ view })
          : c.json({ error: { code: 'TOURNAMENT_NOT_FOUND' as const } }, 404)
      })

      // Inscription à un tournoi ouvert.
      .post('/tournaments/:id/join', validateJson(EnterTournamentInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.join(c.req.param('id'), player, c.req.valid('json').tactic)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Lancement du tournoi par son hôte.
      .post('/tournaments/:id/start', async (c) => {
        const result: CommandResult = await service.start(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type TournamentApi = ReturnType<typeof createTournamentApi>
