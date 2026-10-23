import { describe, expect, it } from 'vitest'
import { type Activity, CHEST_REWARD, type QuestBoardView } from '@/modules/quests/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createEventStore, type NewEvent } from '@/platform/event-store/event-store'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Tableau des quêtes du jour d'un joueur. */
async function boardOf(api: TestApi, player = 'alice') {
  const res = await api.get('/api/quests/board', player)
  return ((await res.json()) as { view: QuestBoardView }).view
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player = 'alice'): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

let streams = 0

/**
 * Le joueur pratique une activité, à l'instant présent de l'application. Les messages de la
 * Taverne passent par son API ; les autres activités sont des événements publiés par leur
 * module, enregistrés tels que la projection des Quêtes les lit.
 */
async function perform(api: TestApi, player: string, activity: Activity, at: number) {
  if (activity === 'message') {
    await api.post('/api/tavern/messages', { body: `Message de ${player}` }, player)
    return
  }
  const store = createEventStore(api.db)
  const append = async (stream: string, event: NewEvent) =>
    store.append(stream, (await store.read(stream)).length, [event])
  const id = `q${++streams}`
  switch (activity) {
    case 'upgrade':
      return append(`village-${player}`, {
        type: 'BuildingUpgraded',
        data: { building: 'sawmill', toLevel: 2, cost: {}, at },
      })
    case 'forge':
    case 'forge_rare':
      return append(`forge-${player}`, {
        type: 'ItemCollected',
        data: {
          number: streams,
          recipe: activity === 'forge' ? 'dagger' : 'waraxe',
          smithName: player,
          at,
        },
      })
    case 'dungeon_end':
    case 'dungeon_win':
      return append(`dungeon-${id}`, {
        type: 'GameEnded',
        data: {
          result: activity === 'dungeon_win' ? 'won' : 'lost',
          loot: 0,
          heroIds: [player],
          at,
        },
      })
    case 'tournament_join':
      return append(`tournament-${id}`, { type: 'TournamentOpened', data: { hostId: player, at } })
    case 'tournament_win':
      return append(`tournament-${id}`, {
        type: 'PrizesAwarded',
        data: { championId: player, finalistId: null, at },
      })
    case 'offer':
      return append(`market-${id}`, { type: 'OfferPublished', data: { sellerId: player, at } })
  }
}

/** Accomplit toutes les quêtes du jour d'un joueur, et renvoie son tableau. */
async function completeAll(api: TestApi, player = 'alice') {
  const board = await boardOf(api, player)
  for (const quest of board.quests) {
    for (let i = 0; i < quest.target; i++) await perform(api, player, quest.activity, board.asOf)
  }
  return boardOf(api, player)
}

/** Application de test où Alice a fondé son village : 0 pièce d'or, horloge figée. */
async function questsWithVillage() {
  const api = await createTestApi()
  await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')
  return api
}

const claim = (api: TestApi, questId: string, player = 'alice') =>
  api.post(`/api/quests/quests/${questId}/claim`, {}, player)

describe('API du module Quêtes', () => {
  it('refuse toute requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/quests/board', null)).status).toBe(401)
    expect((await api.post('/api/quests/quests/forge-1/claim', {}, null)).status).toBe(401)
    expect((await api.post('/api/quests/chest/open', {}, null)).status).toBe(401)
  })

  it('présente trois quêtes à faire, le coffre fermé, et le renouvellement à minuit', async () => {
    const api = await questsWithVillage()
    const board = await boardOf(api)
    expect(board.quests.map((q) => q.difficulty)).toEqual(['easy', 'medium', 'hard'])
    expect(board.quests.every((q) => q.progress === 0 && !q.done && !q.claimed)).toBe(true)
    expect(board).toMatchObject({
      earnedToday: 0,
      hasVillage: true,
      chest: { claimed: 0, opened: false },
    })
    expect(board.resetsAt).toBe(Date.UTC(2026, 0, 2))
  })

  it('coche les quêtes à mesure que le joueur agit dans les autres modules, Taverne comprise', async () => {
    const api = await questsWithVillage()
    const board = await completeAll(api)
    expect(board.quests.every((q) => q.done && q.progress === q.target)).toBe(true)
  })

  it("ne compte ni l'activité des autres joueurs, ni celle de la veille", async () => {
    const api = await questsWithVillage()
    await api.post('/api/realm/village', { name: 'Village de Bob' }, 'bob')
    const yesterday = (await boardOf(api)).asOf - 1
    const board = await boardOf(api)
    for (const quest of board.quests) {
      if (quest.activity !== 'message') await perform(api, 'alice', quest.activity, yesterday)
      await perform(api, 'bob', quest.activity, board.asOf)
    }
    const after = await boardOf(api)
    expect(after.quests.every((q) => q.progress === 0)).toBe(true)
  })

  it("verse l'or d'une quête accomplie au village du joueur, une seule fois", async () => {
    const api = await questsWithVillage()
    const board = await completeAll(api)
    const quest = board.quests[0] as QuestBoardView['quests'][number]

    const res = await claim(api, quest.id)
    expect(res.status).toBe(200)
    const { view } = (await res.json()) as { view: QuestBoardView }
    expect(view.quests[0]).toMatchObject({ claimed: true })
    expect(view.earnedToday).toBe(quest.reward)
    expect((await stockOf(api)).gold).toBe(quest.reward)

    const again = await claim(api, quest.id)
    expect(again.status).toBe(409)
    expect((await stockOf(api)).gold).toBe(quest.reward)
  })

  it("refuse une quête non accomplie (409), ou qui n'est pas du jour (404)", async () => {
    const api = await questsWithVillage()
    const board = await boardOf(api)
    const res = await claim(api, board.quests[2]?.id ?? '')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_COMPLETED' } })
    expect((await claim(api, 'quete-inventee')).status).toBe(404)
  })

  it("refuse la récompense d'un joueur sans village (409)", async () => {
    const api = await createTestApi()
    const board = await completeAll(api, 'bob')
    const res = await claim(api, board.quests[0]?.id ?? '', 'bob')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'NO_VILLAGE' } })
  })

  it('ouvre le coffre du jour une fois les trois récompenses récupérées, et une seule fois', async () => {
    const api = await questsWithVillage()
    const board = await completeAll(api)
    expect((await api.post('/api/quests/chest/open', {})).status).toBe(409)

    for (const quest of board.quests) await claim(api, quest.id)
    const res = await api.post('/api/quests/chest/open', {})
    expect(res.status).toBe(200)
    const total = board.quests.reduce((sum, q) => sum + q.reward, 0) + CHEST_REWARD
    expect(((await res.json()) as { view: QuestBoardView }).view.earnedToday).toBe(total)
    expect((await stockOf(api)).gold).toBe(total)
    expect((await api.post('/api/quests/chest/open', {})).status).toBe(409)
  })

  it('renouvelle les quêtes à minuit : la récompense non récupérée de la veille est perdue', async () => {
    const api = await questsWithVillage()
    const yesterday = await completeAll(api)
    api.advance(24 * 60)
    const today = await boardOf(api)
    expect(today.resetsAt).toBe(yesterday.resetsAt + 24 * 60 * 60_000)
    expect(today.quests.every((q) => q.progress === 0)).toBe(true)
    const lost = yesterday.quests.find((q) => !today.quests.some((t) => t.id === q.id))
    if (lost) expect((await claim(api, lost.id)).status).toBe(404)
  })

  it("exporte l'activité et les récompenses du joueur, puis les efface avec son compte", async () => {
    const api = await questsWithVillage()
    const board = await completeAll(api)
    await claim(api, board.quests[0]?.id ?? '')
    const exported = await (await api.get('/api/account/export')).json()
    expect(exported.sections.quests.activity.length).toBeGreaterThan(0)
    expect(exported.sections.quests.rewards).toMatchObject([{ type: 'QuestRewardClaimed' }])

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const after = await (await api.get('/api/account/export')).json()
    expect(after.sections.quests.activity).toEqual([])
  })
})
