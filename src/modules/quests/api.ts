import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import type { QuestsService } from './application/quests-service'
import type { QuestError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<QuestError['code'], 404 | 409> = {
  QUEST_NOT_TODAY: 404,
  NOT_COMPLETED: 409,
  ALREADY_CLAIMED: 409,
  NO_VILLAGE: 409,
  CHEST_LOCKED: 409,
  ALREADY_OPENED: 409,
}

/**
 * Sous-application Hono du module Quêtes, montée sur /api/quests.
 * Le joueur est toujours celui que l'authentification a identifié : chaque route ne lit et
 * ne récompense que son propre tableau.
 */
export function createQuestsApi(service: QuestsService) {
  return (
    new Hono<AppEnv>()
      // Tableau des quêtes du jour.
      .get('/board', async (c) => c.json({ view: await service.board(c.var.userId) }))

      // Récupération de la récompense d'une quête accomplie.
      .post('/quests/:questId/claim', async (c) => {
        const result = await service.claim(c.var.userId, c.req.param('questId'))
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Ouverture du coffre du jour.
      .post('/chest/open', async (c) => {
        const result = await service.openChest(c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type QuestsApi = ReturnType<typeof createQuestsApi>
