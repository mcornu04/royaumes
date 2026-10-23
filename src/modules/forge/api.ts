import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { CommandResult, ForgeService } from './application/forge-service'
import { type ForgeError, PlaceOrderInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<ForgeError['code'], 404 | 409 | 422> = {
  UNKNOWN_RECIPE: 422,
  FORGE_BUSY: 409,
  RANK_TOO_LOW: 409,
  NO_ORDER: 404,
  PAYMENT_PENDING: 409,
  NOT_READY: 409,
  ALREADY_READY: 409,
}

/**
 * Sous-application Hono du module Forge, montée sur /api/forge.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur, et chacune n'agit que sur l'atelier du joueur connecté.
 */
export function createForgeApi(service: ForgeService) {
  return (
    new Hono<AppEnv>()
      // Vue de l'atelier : rang, commande en cours, armurerie et catalogue.
      .get('/workshop', async (c) => c.json({ view: await service.getView(c.var.userId) }))

      // Commande d'une pièce : le coût est prélevé dans le village du joueur.
      .post('/orders', validateJson(PlaceOrderInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result: CommandResult = await service.placeOrder(player, c.req.valid('json').recipe)
        return result.ok
          ? c.json({ view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Annulation de la commande en cours : son coût est remboursé.
      .post('/orders/current/cancel', async (c) => {
        const result = await service.cancelOrder(c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Récupération de la pièce forgée, une fois son échéance passée.
      .post('/orders/current/collect', async (c) => {
        const result = await service.collectItem(c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type ForgeApi = ReturnType<typeof createForgeApi>
