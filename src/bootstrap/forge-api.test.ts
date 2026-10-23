import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ForgeView } from '@/modules/forge/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test où Alice et Bob ont fondé leur village : chacun dispose de 100 bois et
 * 50 pierre. L'horloge reste figée tant que le test ne la fait pas avancer.
 */
async function forgeWithVillages() {
  const api = await createTestApi()
  for (const player of ['alice', 'bob']) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  }
  return api
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player = 'alice'): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Commande une pièce au nom d'un joueur ; renvoie le statut et le corps de la réponse. */
async function order(api: TestApi, recipe: string, player = 'alice') {
  const res = await api.post('/api/forge/orders', { recipe }, player)
  return {
    status: res.status,
    body: (await res.json()) as { view: ForgeView; error?: { code: string } },
  }
}

/** Envoie une commande sur la pièce en cours (« cancel » ou « collect »). */
async function onCurrent(api: TestApi, action: 'cancel' | 'collect', player = 'alice') {
  const res = await api.post(`/api/forge/orders/current/${action}`, {}, player)
  return {
    status: res.status,
    body: (await res.json()) as { view: ForgeView; error?: { code: string } },
  }
}

describe('API du module Forge', () => {
  it('refuse toute requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/forge/workshop', null)).status).toBe(401)
    expect((await api.post('/api/forge/orders', { recipe: 'dagger' }, null)).status).toBe(401)
    expect((await api.post('/api/forge/orders/current/cancel', {}, null)).status).toBe(401)
    expect((await api.post('/api/forge/orders/current/collect', {}, null)).status).toBe(401)
  })

  it("présente un atelier vide, au rang d'apprenti, avec le catalogue", async () => {
    const api = await forgeWithVillages()
    const { view } = (await (await api.get('/api/forge/workshop')).json()) as { view: ForgeView }
    expect(view).toMatchObject({ rank: 'apprentice', power: 0, current: null, armory: [] })
    expect(view.recipes.filter((r) => r.unlocked).map((r) => r.recipe)).toEqual([
      'dagger',
      'longbow',
      'waraxe',
    ])
  })

  it('refuse une recette absente du catalogue (400)', async () => {
    const api = await forgeWithVillages()
    expect((await order(api, 'excalibur')).status).toBe(400)
    expect((await api.post('/api/forge/orders', {})).status).toBe(400)
  })

  it('ignore un identifiant de joueur glissé dans le corps : la commande reste au nom du joueur connecté', async () => {
    const api = await forgeWithVillages()
    const res = await api.post('/api/forge/orders', { recipe: 'dagger', playerId: 'bob' }, 'alice')
    expect(res.status).toBe(201)
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 70, stone: 40 })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 100, stone: 50 })
  })

  it('prélève le coût dans le village pendant la requête, puis met la pièce à la forge', async () => {
    const api = await forgeWithVillages()
    const { status, body } = await order(api, 'waraxe')

    expect(status).toBe(201)
    expect(body.view.current).toMatchObject({ recipe: 'waraxe', status: 'forging' })
    expect(await stockOf(api)).toMatchObject({ wood: 50, stone: 10 })
  })

  it('refuse la commande si le village ne peut pas la payer, sans rien prélever', async () => {
    const api = await forgeWithVillages()
    // Le village ne compte que 50 pierre : la hache de guerre en demande 40, puis 40 encore.
    await order(api, 'waraxe')
    api.advance(1)
    await onCurrent(api, 'collect')

    const before = await stockOf(api)
    const { body } = await order(api, 'waraxe')
    expect(body.view.current).toBeNull()
    expect(body.view.setback).toEqual({
      number: 2,
      recipe: 'waraxe',
      outcome: 'rejected',
      missing: { stone: 40 - before.stone },
    })
    expect(await stockOf(api)).toEqual(before)
  })

  it("refuse une seconde commande tant qu'une pièce est à la forge (409)", async () => {
    const api = await forgeWithVillages()
    await order(api, 'dagger')
    const { status, body } = await order(api, 'longbow')
    expect(status).toBe(409)
    expect(body.error?.code).toBe('FORGE_BUSY')
  })

  it("refuse une recette d'un rang supérieur à celui du forgeron (409)", async () => {
    const api = await forgeWithVillages()
    const { status, body } = await order(api, 'kingsblade')
    expect(status).toBe(409)
    expect(body.error).toEqual({ code: 'RANK_TOO_LOW', required: 'master' })
  })

  it("ne livre la pièce qu'à son échéance, puis l'ajoute à l'armurerie", async () => {
    const api = await forgeWithVillages()
    await order(api, 'dagger')

    const early = await onCurrent(api, 'collect')
    expect(early.status).toBe(409)
    expect(early.body.error?.code).toBe('NOT_READY')

    api.advance(1)
    const { status, body } = await onCurrent(api, 'collect')
    expect(status).toBe(200)
    expect(body.view.current).toBeNull()
    expect(body.view.armory).toMatchObject([{ recipe: 'dagger', smithName: 'alice' }])
    expect(body.view.power).toBe(5)
  })

  it('rembourse intégralement une commande annulée avant la fin de la forge', async () => {
    const api = await forgeWithVillages()
    await order(api, 'waraxe')
    expect(await stockOf(api)).toMatchObject({ wood: 50, stone: 10 })

    const { status, body } = await onCurrent(api, 'cancel')
    expect(status).toBe(200)
    expect(body.view.setback).toMatchObject({ outcome: 'cancelled' })
    // La compensation est versée pendant la requête : le stock est rétabli.
    expect(await stockOf(api)).toMatchObject({ wood: 100, stone: 50 })
  })

  it("refuse l'annulation sans commande (404), et une fois la pièce prête (409)", async () => {
    const api = await forgeWithVillages()
    expect((await onCurrent(api, 'cancel')).status).toBe(404)
    await order(api, 'dagger')
    api.advance(1)
    const { status, body } = await onCurrent(api, 'cancel')
    expect(status).toBe(409)
    expect(body.error?.code).toBe('ALREADY_READY')
  })

  it("n'agit que sur l'atelier du joueur connecté", async () => {
    const api = await forgeWithVillages()
    await order(api, 'dagger', 'alice')
    // Bob n'a aucune commande : il ne peut ni annuler ni récupérer celle d'Alice.
    expect((await onCurrent(api, 'cancel', 'bob')).status).toBe(404)
    expect((await onCurrent(api, 'collect', 'bob')).status).toBe(404)
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 100, stone: 50 })
  })

  it("réserve le canal d'un atelier à son propriétaire", async () => {
    const api = await forgeWithVillages()
    expect((await api.get('/api/stream/forge-bob', 'alice')).status).toBe(403)
    const res = await api.get('/api/stream/forge-alice/events?after=0', 'alice')
    expect(res.status).toBe(200)
  })

  it("exporte les commandes du joueur, puis efface son nom des événements de l'atelier", async () => {
    const api = await forgeWithVillages()
    await order(api, 'dagger')
    api.advance(1)
    await onCurrent(api, 'collect')

    const exported = await (await api.get('/api/account/export')).json()
    expect(exported.sections.forge).toMatchObject({
      orders: [{ number: 1, recipe: 'dagger', smithName: 'alice', cost: { wood: 30, stone: 10 } }],
      armory: [{ number: 1, recipe: 'dagger' }],
    })

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const result = await api.db.execute(
      sql`SELECT data->>'smithName' AS smith FROM platform.events WHERE stream = 'forge-alice'
          AND type IN ('OrderPlaced', 'ItemCollected')`,
    )
    const smiths = (result as unknown as { rows: { smith: string }[] }).rows.map((r) => r.smith)
    expect(smiths).toEqual(['Joueur effacé', 'Joueur effacé'])
  })
})
