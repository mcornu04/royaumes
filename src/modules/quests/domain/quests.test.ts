import { describe, expect, it } from 'vitest'
import { dailyQuests, dayOf, isDone, progressOf } from './board'
import { type ActivityCounts, CHEST_REWARD, DAY_MS, type QuestSpec } from './catalog'
import {
  decide,
  evolve,
  initialState,
  type PlayerContext,
  type QuestCommand,
  type QuestLogState,
} from './quests'
import { depositsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1, 9)
const DAY = dayOf(T0)
const quests = dailyQuests('alice', DAY)

/** Activité qui accomplit toutes les quêtes du jour d'Alice. */
const everything: ActivityCounts = Object.fromEntries(quests.map((q) => [q.activity, q.target]))
const context = (activity: ActivityCounts = everything, hasVillage = true): PlayerContext => ({
  playerId: 'alice',
  activity,
  hasVillage,
})
const claim = (quest: QuestSpec, ctx = context()): QuestCommand => ({
  type: 'ClaimReward',
  questId: quest.id,
  context: ctx,
})

/** Applique une commande acceptée ; renvoie le nouvel état et les événements. */
function play(state: QuestLogState, command: QuestCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  return { state: decision.events.reduce(evolve, state), events: decision.events }
}

/** Journal dont les trois récompenses du jour ont été récupérées. */
const allClaimed = quests.reduce((state, quest) => play(state, claim(quest)).state, initialState)

describe('Quêtes - règle 1 : trois quêtes par jour, une par difficulté, de trois modules différents', () => {
  it('tire une quête facile, une moyenne et une difficile, de modules distincts', () => {
    for (const player of ['alice', 'bob', 'carol', 'dave']) {
      for (let day = DAY; day < DAY + 30; day++) {
        const board = dailyQuests(player, day)
        expect(board.map((q) => q.difficulty)).toEqual(['easy', 'medium', 'hard'])
        expect(new Set(board.map((q) => q.module)).size).toBe(3)
      }
    }
  })

  it('donne les mêmes quêtes toute la journée, et renouvelle le tirage au fil des jours', () => {
    expect(dailyQuests('alice', DAY)).toEqual(quests)
    const month = Array.from({ length: 30 }, (_, i) =>
      dailyQuests('alice', DAY + i)
        .map((q) => q.id)
        .join(),
    )
    expect(new Set(month).size).toBeGreaterThan(5)
    expect(dayOf(T0 + DAY_MS)).toBe(DAY + 1)
  })
})

describe("Quêtes - règles 2 et 3 : une quête avance avec l'activité du jour, et se coche à son objectif", () => {
  const twoUpgrades: QuestSpec = {
    id: 'upgrade-2',
    module: 'realm',
    activity: 'upgrade',
    target: 2,
    difficulty: 'medium',
    reward: 30,
  }

  it("compte l'activité, plafonnée à l'objectif", () => {
    expect(progressOf(twoUpgrades, {})).toBe(0)
    expect(progressOf(twoUpgrades, { upgrade: 1 })).toBe(1)
    expect(progressOf(twoUpgrades, { upgrade: 5 })).toBe(2)
  })

  it("coche la quête dès que l'objectif est atteint, et la présente ainsi dans la vue", () => {
    expect(isDone(twoUpgrades, { upgrade: 1 })).toBe(false)
    expect(isDone(twoUpgrades, { upgrade: 2 })).toBe(true)
    const view = toView(initialState, 'alice', everything, true, T0)
    expect(view.quests.every((q) => q.done && !q.claimed)).toBe(true)
    expect(view.resetsAt).toBe((DAY + 1) * DAY_MS)
  })
})

describe('Quêtes - règle 4 : une récompense se récupère une fois, le jour même, pour une quête accomplie', () => {
  it("verse la récompense d'une quête accomplie au village du joueur", () => {
    const quest = quests[0] as QuestSpec
    const { events } = play(initialState, claim(quest))
    expect(events).toEqual([
      {
        type: 'QuestRewardClaimed',
        data: { day: DAY, questId: quest.id, reward: quest.reward, at: T0 },
      },
    ])
    expect(depositsFor('alice', events[0] as never)).toEqual([
      {
        transferId: `quest:${DAY}:${quest.id}:alice`,
        playerId: 'alice',
        resources: { gold: quest.reward },
      },
    ])
  })

  it("refuse une quête non accomplie, déjà récompensée, ou qui n'est pas du jour", () => {
    const quest = quests[2] as QuestSpec
    expect(decide(initialState, claim(quest, context({})), T0)).toMatchObject({
      error: { code: 'NOT_COMPLETED' },
    })
    expect(decide(allClaimed, claim(quest), T0)).toMatchObject({
      error: { code: 'ALREADY_CLAIMED' },
    })
    expect(
      decide(initialState, { type: 'ClaimReward', questId: 'inventée', context: context() }, T0),
    ).toMatchObject({
      error: { code: 'QUEST_NOT_TODAY' },
    })
  })

  it('perd la récompense non récupérée à minuit : la quête de la veille ne fait plus partie du tableau', () => {
    // On cherche une quête de la veille qui ne figure plus au tableau du lendemain.
    const yesterday = dailyQuests('alice', DAY)
    let next = DAY + 1
    while (dailyQuests('alice', next).some((q) => q.id === yesterday[2]?.id)) next++
    expect(decide(initialState, claim(yesterday[2] as QuestSpec), next * DAY_MS)).toMatchObject({
      error: { code: 'QUEST_NOT_TODAY' },
    })
  })
})

describe('Quêtes - règle 5 : une récompense demande un village pour recevoir son or', () => {
  it("refuse la récompense d'un joueur sans village", () => {
    expect(
      decide(initialState, claim(quests[0] as QuestSpec, context(everything, false)), T0),
    ).toMatchObject({
      error: { code: 'NO_VILLAGE' },
    })
  })
})

describe('Quêtes - règle 6 : le coffre du jour', () => {
  it('reste fermé tant que les trois récompenses ne sont pas récupérées', () => {
    const twoClaimed = play(
      play(initialState, claim(quests[0] as QuestSpec)).state,
      claim(quests[1] as QuestSpec),
    ).state
    expect(decide(twoClaimed, { type: 'OpenChest', context: context() }, T0)).toMatchObject({
      error: { code: 'CHEST_LOCKED' },
    })
    expect(toView(twoClaimed, 'alice', everything, true, T0).chest).toMatchObject({
      claimed: 2,
      ready: false,
    })
  })

  it("s'ouvre une seule fois par jour, et verse son or en plus de celui des quêtes", () => {
    expect(toView(allClaimed, 'alice', everything, true, T0).chest.ready).toBe(true)
    const { state, events } = play(allClaimed, { type: 'OpenChest', context: context() })
    expect(events[0]).toEqual({
      type: 'DailyChestOpened',
      data: { day: DAY, reward: CHEST_REWARD, at: T0 },
    })
    expect(depositsFor('alice', events[0] as never)[0]?.transferId).toBe(`quest:${DAY}:chest:alice`)
    expect(decide(state, { type: 'OpenChest', context: context() }, T0)).toMatchObject({
      error: { code: 'ALREADY_OPENED' },
    })
    const total = quests.reduce((sum, q) => sum + q.reward, 0) + CHEST_REWARD
    expect(toView(state, 'alice', everything, true, T0)).toMatchObject({
      earnedToday: total,
      chest: { opened: true, ready: false },
    })
  })
})
