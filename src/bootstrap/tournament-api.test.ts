import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { RANK_THRESHOLDS } from '@/modules/forge/contracts'
import { BUILDINGS } from '@/modules/realm/contracts'
import {
  type Eligibility,
  ENTRY_REQUIREMENTS,
  PRIZES,
  ROUND_MS,
  type TournamentList,
  type TournamentView,
} from '@/modules/tournament/contracts'
import { createEventStore, type NewEvent } from '@/platform/event-store/event-store'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Minutes équivalant à un tour de tournoi, pour faire avancer l'horloge de l'application. */
const ROUND_MINUTES = ROUND_MS / 60_000

/**
 * Prépare un joueur : il fonde son village par l'API, puis le journal reçoit, comme s'ils
 * avaient été enregistrés par le Village et la Forge, les améliorations de ses bâtiments et
 * les pièces récupérées à sa forge. Le Tournoi n'en connaît que ce langage publié.
 */
async function prepare(api: TestApi, player: string, level = 5, daggers = 2) {
  await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  const store = createEventStore(api.db)
  const village = `village-${player}`
  const upgrades: NewEvent[] = []
  for (let toLevel = 2; toLevel <= level; toLevel++) {
    for (const building of BUILDINGS) {
      upgrades.push({ type: 'BuildingUpgraded', data: { building, toLevel, cost: {}, at: 0 } })
    }
  }
  await store.append(village, (await store.read(village)).length, upgrades)
  const pieces: NewEvent[] = Array.from({ length: daggers }, (_, i) => ({
    type: 'ItemCollected',
    data: { number: i + 1, recipe: 'dagger', smithName: player, at: 0 },
  }))
  if (pieces.length > 0) await store.append(`forge-${player}`, 0, pieces)
}

/** Tournoi ouvert par Alice, et rejoint par Bob, tous deux admis. */
async function tournamentWithTwoPlayers() {
  const api = await createTestApi()
  await prepare(api, 'alice')
  await prepare(api, 'bob')
  const res = await api.post('/api/tournament/tournaments', { tactic: 'offensive' }, 'alice')
  const { tournamentId } = (await res.json()) as { tournamentId: string }
  await api.post(`/api/tournament/tournaments/${tournamentId}/join`, { tactic: 'defensive' }, 'bob')
  return { api, tournamentId }
}

/** Vue d'un tournoi pour un joueur. */
async function viewOf(api: TestApi, tournamentId: string, player = 'alice') {
  const res = await api.get(`/api/tournament/tournaments/${tournamentId}`, player)
  return ((await res.json()) as { view: TournamentView }).view
}

/** Versements de récompenses enregistrés dans le journal du Village. */
async function prizeDeposits(api: TestApi) {
  const result = await api.db.execute(
    sql`SELECT stream, data FROM platform.events WHERE type = 'ResourcesDeposited'
        AND data->>'transferId' LIKE 'tournament:%' ORDER BY position`,
  )
  return (result as unknown as { rows: { stream: string; data: { resources: unknown } }[] }).rows
}

describe('API du module Tournoi', () => {
  it('refuse toute requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/tournament/eligibility', null)).status).toBe(401)
    expect((await api.get('/api/tournament/tournaments', null)).status).toBe(401)
    expect(
      (await api.post('/api/tournament/tournaments', { tactic: 'balanced' }, null)).status,
    ).toBe(401)
    expect((await api.get('/api/tournament/tournaments/t1', null)).status).toBe(401)
    expect(
      (await api.post('/api/tournament/tournaments/t1/join', { tactic: 'balanced' }, null)).status,
    ).toBe(401)
    expect((await api.post('/api/tournament/tournaments/t1/start', {}, null)).status).toBe(401)
  })

  it('exige le rang de compagnon de la Forge, tel que la Forge le définit', () => {
    expect(ENTRY_REQUIREMENTS.forgedPieces).toBe(RANK_THRESHOLDS.journeyman)
  })

  it('déduit le profil du joueur des événements du Village et de la Forge', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Hameau' }, 'carol')
    const fresh = (await (
      await api.get('/api/tournament/eligibility', 'carol')
    ).json()) as Eligibility
    // Un village tout juste fondé : scierie et carrière au niveau 1, aucune mine, aucune pièce.
    expect(fresh.profile).toEqual({
      levels: { sawmill: 1, quarry: 1, mine: 0 },
      forged: 0,
      power: 0,
    })
    expect(fresh.eligible).toBe(false)
    expect(fresh.shortfalls).toHaveLength(4)

    await prepare(api, 'alice', 6, 3)
    const ready = (await (await api.get('/api/tournament/eligibility')).json()) as Eligibility
    expect(ready).toMatchObject({
      eligible: true,
      profile: { levels: { sawmill: 6, quarry: 6, mine: 6 }, forged: 3, power: 15 },
      shortfalls: [],
    })
  })

  it("refuse l'ouverture et l'inscription d'un joueur qui ne remplit pas les conditions (403)", async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    await prepare(api, 'carol', 4, 1)
    const opened = await api.post('/api/tournament/tournaments', { tactic: 'balanced' }, 'carol')
    expect(opened.status).toBe(403)
    expect(await opened.json()).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } })
    const joined = await api.post(
      `/api/tournament/tournaments/${tournamentId}/join`,
      { tactic: 'balanced' },
      'carol',
    )
    expect(joined.status).toBe(403)
  })

  it('refuse une tactique inconnue (400)', async () => {
    const api = await createTestApi()
    await prepare(api, 'alice')
    expect((await api.post('/api/tournament/tournaments', { tactic: 'berserk' })).status).toBe(400)
  })

  it('ouvre un tournoi, inscrit un second joueur et le présente dans la liste', async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    const view = await viewOf(api, tournamentId, 'bob')
    expect(view).toMatchObject({
      status: 'open',
      hostName: 'alice',
      isHost: false,
      joined: true,
      seatsLeft: 6,
    })
    expect(view.entrants.map((e) => [e.name, e.tactic])).toEqual([
      ['alice', 'offensive'],
      ['bob', 'defensive'],
    ])
    const list = (await (await api.get('/api/tournament/tournaments')).json()) as TournamentList
    expect(list.tournaments).toMatchObject([
      { tournamentId, hostName: 'alice', entrants: 2, status: 'open' },
    ])
  })

  it('refuse une seconde inscription du même joueur (409), et un tournoi inconnu (404)', async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    const again = await api.post(
      `/api/tournament/tournaments/${tournamentId}/join`,
      { tactic: 'balanced' },
      'bob',
    )
    expect(again.status).toBe(409)
    expect((await api.get('/api/tournament/tournaments/inconnu')).status).toBe(404)
  })

  it("réserve le lancement à l'hôte, et complète le tableau par des chevaliers de l'ordinateur", async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    expect(
      (await api.post(`/api/tournament/tournaments/${tournamentId}/start`, {}, 'bob')).status,
    ).toBe(403)

    const res = await api.post(`/api/tournament/tournaments/${tournamentId}/start`, {}, 'alice')
    expect(res.status).toBe(200)
    const { view } = (await res.json()) as { view: TournamentView }
    expect(view).toMatchObject({ status: 'running', round: 0 })
    expect(view.entrants).toHaveLength(8)
    expect(view.entrants.filter((e) => e.bot)).toHaveLength(6)
    // Le tournoi lancé n'accepte plus d'inscription.
    await prepare(api, 'carol')
    const late = await api.post(
      `/api/tournament/tournaments/${tournamentId}/join`,
      { tactic: 'balanced' },
      'carol',
    )
    expect(late.status).toBe(409)
  })

  it('dévoile les tours à leur échéance, puis désigne le champion', async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    await api.post(`/api/tournament/tournaments/${tournamentId}/start`, {}, 'alice')

    expect((await viewOf(api, tournamentId)).rounds[0]?.every((m) => m.winner === null)).toBe(true)
    api.advance(ROUND_MINUTES)
    const semis = await viewOf(api, tournamentId)
    expect(semis.round).toBe(1)
    expect(semis.rounds[0]?.every((m) => m.winner !== null)).toBe(true)

    api.advance(2 * ROUND_MINUTES)
    const final = await viewOf(api, tournamentId)
    expect(final.status).toBe('finished')
    expect(final.champion).toBe(final.rounds[2]?.[0]?.winner)
  })

  it('verse une seule fois les récompenses aux joueurs du podium, à la fin du tournoi', async () => {
    // Alice, au village et à l'armurerie très avancés, atteint la finale à coup sûr en pratique :
    // le test vérifie ainsi un versement réel, et non une liste vide.
    const api = await createTestApi()
    await prepare(api, 'alice', 10, 40)
    const res = await api.post('/api/tournament/tournaments', { tactic: 'offensive' }, 'alice')
    const { tournamentId } = (await res.json()) as { tournamentId: string }
    await api.post(`/api/tournament/tournaments/${tournamentId}/start`, {}, 'alice')
    api.advance(2 * ROUND_MINUTES)
    await viewOf(api, tournamentId)
    expect(await prizeDeposits(api)).toEqual([])

    api.advance(ROUND_MINUTES)
    const view = await viewOf(api, tournamentId)
    await viewOf(api, tournamentId)
    const final = view.rounds[2]?.[0]
    const podium = [
      { seat: final?.winner, gold: PRIZES.champion.gold },
      { seat: final?.winner === final?.a ? final?.b : final?.a, gold: PRIZES.finalist.gold },
    ]
    // Seuls les joueurs reçoivent leur récompense ; un chevalier de l'ordinateur n'a pas de village.
    const expected = podium
      .map(({ seat, gold }) => ({ entrant: view.entrants[seat ?? -1], gold }))
      .filter(({ entrant }) => entrant && !entrant.bot)
      .map(({ entrant, gold }) => ({
        stream: `village-${entrant?.name}`,
        data: { resources: { gold } },
      }))
    expect(expected.length).toBeGreaterThan(0)
    expect(await prizeDeposits(api)).toMatchObject(expected)
  })

  it('retire de la liste un tournoi terminé, puis de la table par la tâche quotidienne', async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    await api.post(`/api/tournament/tournaments/${tournamentId}/start`, {}, 'alice')
    const listed = async () =>
      ((await (await api.get('/api/tournament/tournaments')).json()) as TournamentList).tournaments
    const rows = async () =>
      (
        (await api.db.execute(
          sql`SELECT tournament_id FROM tournament.tournaments`,
        )) as unknown as {
          rows: unknown[]
        }
      ).rows.length
    const daily = async () =>
      (
        await (
          await api.api.request('/api/cron/daily', {
            headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
          })
        ).json()
      ).tournament

    // En cours : le tournoi est présenté.
    expect(await listed()).toMatchObject([{ tournamentId, status: 'started' }])

    // Terminé : il sort de la liste, mais reste consultable par son adresse.
    api.advance(3 * ROUND_MINUTES)
    expect(await listed()).toEqual([])
    expect((await viewOf(api, tournamentId)).status).toBe('finished')

    // La tâche quotidienne ne le retire de la table qu'au-delà de vingt-quatre heures.
    expect(await daily()).toEqual({ ok: true, result: { tournaments: 0 } })
    expect(await rows()).toBe(1)
    api.advance(24 * 60)
    expect(await daily()).toEqual({ ok: true, result: { tournaments: 0 } })
    api.advance(1)
    expect(await daily()).toEqual({ ok: true, result: { tournaments: 1 } })
    expect(await rows()).toBe(0)
  })

  it('annonce les tournois sur le canal global du Tournoi, sans aucune de leurs données', async () => {
    const { api } = await tournamentWithTwoPlayers()
    const res = await api.get('/api/stream/tournaments/events?after=0', 'carol')
    expect(res.status).toBe(200)
    const { events } = (await res.json()) as { events: { type: string; data: unknown }[] }
    expect(events.map((e) => e.type)).toEqual(['TournamentOpened', 'EntrantJoined'])
    for (const event of events) expect(event.data).toEqual({})
  })

  it("ignore un identifiant de joueur glissé dans le corps : l'hôte est le joueur connecté", async () => {
    const api = await createTestApi()
    await prepare(api, 'alice')
    const res = await api.post(
      '/api/tournament/tournaments',
      { tactic: 'balanced', playerId: 'bob' },
      'alice',
    )
    expect(res.status).toBe(201)
    const { view } = (await res.json()) as { view: TournamentView }
    expect(view).toMatchObject({ hostName: 'alice', isHost: true })
    expect(view.entrants.map((e) => e.name)).toEqual(['alice'])
  })

  it('exporte les inscriptions du joueur, puis efface son nom et son profil', async () => {
    const { api, tournamentId } = await tournamentWithTwoPlayers()
    const exported = await (await api.get('/api/account/export')).json()
    expect(exported.sections.tournament).toMatchObject({
      profile: { playerId: 'alice', sawmill: 5 },
      entries: [{ tournamentId, role: 'host', tactic: 'offensive' }],
    })

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const view = await viewOf(api, tournamentId, 'bob')
    expect(view.hostName).toBe('Joueur effacé')
    expect(view.entrants[0]?.name).toBe('Joueur effacé')
    const list = (await (
      await api.get('/api/tournament/tournaments', 'bob')
    ).json()) as TournamentList
    expect(list.tournaments[0]?.hostName).toBe('Joueur effacé')
    const rows = await api.db.execute(
      sql`SELECT 1 FROM tournament.champions WHERE player_id = 'alice'`,
    )
    expect((rows as unknown as { rows: unknown[] }).rows).toEqual([])
  })
})
