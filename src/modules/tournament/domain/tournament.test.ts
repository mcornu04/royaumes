import { describe, expect, it } from 'vitest'
import { BOTS, ROUND_MS, SEATS } from './catalog'
import { bracketOf, type ChampionProfile, damageOf, duel, type Fighter, statsOf } from './combat'
import { createRandom } from './random'
import { prizeTransferId, requestsFor } from './saga'
import {
  type Applicant,
  decide,
  evolve,
  fightersOf,
  initialState,
  type TournamentCommand,
  type TournamentState,
} from './tournament'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)
const SEED = 42

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes. */
function play(state: TournamentState, command: TournamentCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    requests.push(...requestsFor(current, event))
    current = evolve(current, event)
  }
  return { state: current, events: decision.events, requests }
}

/** Profil d'un joueur admis : village au niveau 5, deux pièces forgées. */
const eligible: ChampionProfile = {
  levels: { sawmill: 5, quarry: 5, mine: 5 },
  forged: 2,
  power: 10,
}
const applicant = (playerId: string, profile: ChampionProfile | null = eligible): Applicant => ({
  playerId,
  name: playerId[0]?.toUpperCase() + playerId.slice(1),
  tactic: 'balanced',
  profile,
})
const open = (
  playerId = 'alice',
  profile: ChampionProfile | null = eligible,
): TournamentCommand => ({
  type: 'OpenTournament',
  tournamentId: 't1',
  applicant: applicant(playerId, profile),
})
const join = (playerId: string, profile: ChampionProfile | null = eligible): TournamentCommand => ({
  type: 'JoinTournament',
  applicant: applicant(playerId, profile),
})
const start: TournamentCommand = { type: 'StartTournament', playerId: 'alice', seed: SEED }

const opened = play(initialState, open()).state
const withBob = play(opened, join('bob')).state
const started = play(withBob, start).state
const END = T0 + 3 * ROUND_MS

describe("Tournoi - règle 1 : seuls les joueurs qui remplissent les conditions d'entrée s'inscrivent", () => {
  it('admet un village au niveau 5 partout et deux pièces forgées', () => {
    expect(decide(initialState, open(), T0).ok).toBe(true)
  })

  it('refuse en détaillant chaque condition manquante, y compris sans village ni forge', () => {
    const weak = { levels: { sawmill: 7, quarry: 4, mine: 2 }, forged: 1, power: 5 }
    expect(decide(initialState, open('alice', weak), T0)).toEqual({
      ok: false,
      error: {
        code: 'NOT_ELIGIBLE',
        shortfalls: [
          { kind: 'building', building: 'quarry', level: 4, required: 5 },
          { kind: 'building', building: 'mine', level: 2, required: 5 },
          { kind: 'forge', forged: 1, required: 2 },
        ],
      },
    })
    expect(decide(opened, join('bob', null), T0)).toMatchObject({
      error: { code: 'NOT_ELIGIBLE', shortfalls: { length: 4 } },
    })
  })

  it("fige à l'inscription les caractéristiques déduites du village et de l'armurerie", () => {
    expect(statsOf(eligible)).toEqual({ attack: 8, defense: 6, hp: 63 })
    expect(opened.entrants[0]).toMatchObject({
      playerId: 'alice',
      stats: { attack: 8, defense: 6, hp: 63 },
    })
  })
})

describe('Tournoi - règle 2 : on rejoint un tournoi ouvert, une seule fois, dans la limite des places', () => {
  it('ajoute un joueur, et refuse une seconde inscription du même joueur', () => {
    expect(withBob.entrants.map((e) => e.playerId)).toEqual(['alice', 'bob'])
    expect(decide(withBob, join('bob'), T0)).toMatchObject({ error: { code: 'ALREADY_JOINED' } })
  })

  it('refuse un neuvième inscrit, et toute inscription une fois le tournoi lancé', () => {
    let full = opened
    for (let i = 1; i < SEATS; i++) full = play(full, join(`joueur${i}`)).state
    expect(decide(full, join('retardataire'), T0)).toMatchObject({ error: { code: 'FULL' } })
    expect(decide(started, join('carol'), T0)).toMatchObject({ error: { code: 'NOT_OPEN' } })
    expect(decide(initialState, join('carol'), T0)).toMatchObject({
      error: { code: 'TOURNAMENT_NOT_FOUND' },
    })
  })
})

describe("Tournoi - règle 3 : seul l'hôte lance le tournoi, complété par des chevaliers de l'ordinateur", () => {
  it("refuse le lancement par un autre joueur que l'hôte, ou un second lancement", () => {
    expect(decide(withBob, { ...start, playerId: 'bob' }, T0)).toMatchObject({
      error: { code: 'NOT_HOST' },
    })
    expect(decide(started, start, T0)).toMatchObject({ error: { code: 'NOT_OPEN' } })
  })

  it('comble les places vides par des chevaliers distincts, tirés au sort à partir de la graine', () => {
    const bots = started.entrants.filter((e) => e.playerId === null)
    expect(started.entrants).toHaveLength(SEATS)
    expect(bots).toHaveLength(SEATS - 2)
    expect(new Set(bots.map((b) => b.name)).size).toBe(bots.length)
    for (const bot of bots) expect(BOTS.map((b) => b.name)).toContain(bot.name)
    // Même graine, mêmes chevaliers.
    expect(play(withBob, start).state.entrants).toEqual(started.entrants)
  })
})

describe('Tournoi - règle 4 : les dégâts dépendent des caractéristiques, du dé et du triangle des tactiques', () => {
  const fighter = (tactic: Fighter['tactic']): Fighter => ({
    stats: { attack: 8, defense: 6, hp: 60 },
    tactic,
  })

  it("double l'attaque, ajoute le dé et retranche la défense, avec un minimum de deux", () => {
    expect(damageOf(fighter('balanced'), fighter('balanced'), 3)).toBe(8 * 2 + 3 - 6)
    const feeble = { stats: { attack: 1, defense: 0, hp: 10 }, tactic: 'balanced' as const }
    const wall = { stats: { attack: 1, defense: 40, hp: 10 }, tactic: 'balanced' as const }
    expect(damageOf(feeble, wall, 1)).toBe(2)
  })

  it("donne l'avantage à la tactique qui l'emporte : offensive > équilibrée > défensive > offensive", () => {
    const base = (a: Fighter, b: Fighter) => damageOf(a, b, 3)
    // Offensive contre équilibrée : +1 d'attaque (×2) et +4 d'avantage.
    expect(base(fighter('offensive'), fighter('balanced'))).toBe(16 + 2 + 3 - 6 + 4)
    // Défensive contre offensive : -1 d'attaque (×2), défense adverse -2, et +4 d'avantage.
    expect(base(fighter('defensive'), fighter('offensive'))).toBe(16 - 2 + 3 - 4 + 4)
    // Équilibrée contre défensive : défense adverse +3, et +4 d'avantage.
    expect(base(fighter('balanced'), fighter('defensive'))).toBe(16 + 3 - 9 + 4)
  })

  it("fait frapper les combattants à tour de rôle jusqu'à la chute de l'un d'eux", () => {
    const result = duel(fighter('offensive'), fighter('balanced'), createRandom(SEED))
    expect(result.exchanges.map((e) => e.attacker).slice(0, 4)).toEqual(['a', 'b', 'a', 'b'])
    const last = result.exchanges.at(-1)
    expect(result.winner === 'a' ? last?.hpB : last?.hpA).toBe(0)
  })
})

describe('Tournoi - règle 5 : un tableau à élimination directe, rejouable à l’identique', () => {
  const bracket = bracketOf(fightersOf(started), SEED)

  it('oppose huit combattants, puis quatre, puis deux, chaque vainqueur passant au tour suivant', () => {
    expect(bracket.map((round) => round.length)).toEqual([4, 2, 1])
    expect(new Set(bracket[0]?.flatMap((m) => [m.a, m.b]))).toEqual(
      new Set([0, 1, 2, 3, 4, 5, 6, 7]),
    )
    expect(bracket[1]?.flatMap((m) => [m.a, m.b])).toEqual(bracket[0]?.map((m) => m.winner))
    expect(bracket[2]?.flatMap((m) => [m.a, m.b])).toEqual(bracket[1]?.map((m) => m.winner))
  })

  it('donne le même tableau avec la même graine, et un autre avec une autre graine', () => {
    expect(bracketOf(fightersOf(started), SEED)).toEqual(bracket)
    expect(bracketOf(fightersOf(started), SEED + 1)).not.toEqual(bracket)
  })
})

describe('Tournoi - règle 6 : chaque tour se dévoile à son échéance, sans tâche de fond', () => {
  it("présente les quarts en cours, issue masquée, jusqu'à la fin de leur tour", () => {
    const view = toView(started, 'alice', T0 + ROUND_MS - 1)
    expect(view).toMatchObject({ status: 'running', round: 0, roundEndsAt: T0 + ROUND_MS })
    expect(view?.rounds).toHaveLength(1)
    expect(view?.rounds[0]?.every((match) => match.winner === null)).toBe(true)
  })

  it('dévoile les vainqueurs des quarts et présente les demi-finales au tour suivant', () => {
    const view = toView(started, 'alice', T0 + ROUND_MS)
    expect(view?.round).toBe(1)
    expect(view?.rounds[0]?.every((match) => match.winner !== null)).toBe(true)
    expect(view?.rounds[1]?.every((match) => match.winner === null)).toBe(true)
  })

  it('désigne le champion une fois la finale terminée', () => {
    const final = bracketOf(fightersOf(started), SEED)[2]?.[0]
    const view = toView(started, 'alice', END)
    expect(view).toMatchObject({ status: 'finished', round: 3, champion: final?.winner })
    expect(toView(opened, 'bob', T0)).toMatchObject({ status: 'open', joined: false, seatsLeft: 7 })
  })
})

describe('Tournoi - règle 7 : les joueurs du podium sont récompensés, une seule fois, après la finale', () => {
  it('programme le versement des récompenses à la fin du dernier tour', () => {
    expect(play(withBob, start).requests).toEqual([{ kind: 'award', tournamentId: 't1', at: END }])
  })

  it('refuse de récompenser avant la fin, puis verse les récompenses aux seuls joueurs', () => {
    expect(decide(started, { type: 'AwardPrizes' }, END - 1)).toMatchObject({
      error: { code: 'NOT_FINISHED' },
    })
    const { events, requests } = play(started, { type: 'AwardPrizes' }, END)
    const final = bracketOf(fightersOf(started), SEED)[2]?.[0]
    const championId = final ? (started.entrants[final.winner]?.playerId ?? null) : null
    expect(events[0]).toMatchObject({ type: 'PrizesAwarded', data: { championId } })
    // Seuls les joueurs reçoivent leur récompense : un chevalier n'a pas de village.
    for (const request of requests) {
      expect(['alice', 'bob']).toContain((request as { playerId: string }).playerId)
    }
  })

  it('ne récompense pas deux fois', () => {
    const awarded = play(started, { type: 'AwardPrizes' }, END).state
    expect(play(awarded, { type: 'AwardPrizes' }, END).events).toEqual([])
  })

  it('verse 50 or au champion et 20 au finaliste lorsque ce sont des joueurs', () => {
    const requests = requestsFor(started, {
      type: 'PrizesAwarded',
      data: { championId: 'bob', finalistId: 'alice', at: END },
    })
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: prizeTransferId('t1', 'champion'),
        playerId: 'bob',
        resources: { gold: 50 },
      },
      {
        kind: 'deposit',
        transferId: prizeTransferId('t1', 'finalist'),
        playerId: 'alice',
        resources: { gold: 20 },
      },
    ])
  })
})
