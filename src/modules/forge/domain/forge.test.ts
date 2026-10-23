import { describe, expect, it } from 'vitest'
import { CATALOG } from './catalog'
import {
  decide,
  evolve,
  type ForgeCommand,
  type ForgeState,
  initialState,
  parseTransferId,
  rankOf,
  transferIdOf,
} from './forge'
import { requestsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes de la saga. */
function play(state: ForgeState, command: ForgeCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    requests.push(...requestsFor('alice', current, event))
    current = evolve(current, event)
  }
  return { state: current, events: decision.events, requests }
}

const order = (recipe: string): ForgeCommand => ({
  type: 'PlaceOrder',
  recipe,
  smithName: 'Alice',
})
const result = (
  number: number,
  outcome: 'withdrawn' | 'refused',
  missing?: Record<string, number>,
): ForgeCommand => ({ type: 'RecordTransferResult', number, step: 'pay', outcome, missing })

/** Atelier dont la commande de dague est payée : la pièce sera prête trente secondes plus tard. */
const ordered = play(initialState, order('dagger')).state
const forging = play(ordered, result(1, 'withdrawn')).state
const READY_AT = T0 + CATALOG.dagger.durationMs

/** Atelier ayant forgé un nombre donné de dagues. */
function smithWith(items: number) {
  let state = initialState
  for (let i = 0; i < items; i++) {
    state = play(state, order('dagger')).state
    state = play(state, result(state.orders, 'withdrawn')).state
    state = play(state, { type: 'CollectItem' }, T0 + CATALOG.dagger.durationMs).state
  }
  return state
}

describe('Forge - règle 1 : seules les recettes du catalogue peuvent être commandées', () => {
  it('refuse une recette inconnue', () => {
    expect(decide(initialState, order('excalibur'), T0)).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_RECIPE' },
    })
  })

  it('enregistre la commande, avec le coût et la durée copiés du catalogue', () => {
    const { events } = play(initialState, order('waraxe'))
    expect(events).toEqual([
      {
        type: 'OrderPlaced',
        data: {
          number: 1,
          recipe: 'waraxe',
          smithName: 'Alice',
          cost: { wood: 50, stone: 40 },
          durationMs: 60_000,
          at: T0,
        },
      },
    ])
  })
})

describe('Forge - règle 2 : une seule pièce à la fois', () => {
  it('refuse une commande tant que la précédente est en paiement ou à la forge', () => {
    expect(decide(ordered, order('longbow'), T0)).toMatchObject({ error: { code: 'FORGE_BUSY' } })
    expect(decide(forging, order('longbow'), T0)).toMatchObject({ error: { code: 'FORGE_BUSY' } })
  })

  it('accepte une nouvelle commande une fois la pièce récupérée, avec le numéro suivant', () => {
    const collected = play(forging, { type: 'CollectItem' }, READY_AT).state
    expect(play(collected, order('longbow')).events[0].data).toMatchObject({ number: 2 })
  })
})

describe('Forge - règle 3 : une recette exige un rang suffisant', () => {
  it('calcule le rang à partir du nombre de pièces forgées', () => {
    expect([0, 1, 2, 4, 5, 9].map(rankOf)).toEqual([
      'apprentice',
      'apprentice',
      'journeyman',
      'journeyman',
      'master',
      'master',
    ])
  })

  it("refuse une recette d'un rang supérieur, et l'accepte une fois le rang atteint", () => {
    expect(decide(initialState, order('stoneshield'), T0)).toEqual({
      ok: false,
      error: { code: 'RANK_TOO_LOW', required: 'journeyman' },
    })
    expect(decide(smithWith(2), order('stoneshield'), T0).ok).toBe(true)
    expect(decide(smithWith(4), order('kingsblade'), T0)).toMatchObject({
      error: { code: 'RANK_TOO_LOW', required: 'master' },
    })
    expect(decide(smithWith(5), order('kingsblade'), T0).ok).toBe(true)
  })
})

describe('Forge - règle 4 : le coût est prélevé dans le village, sans rien prélever en cas de refus', () => {
  it('demande au Village le prélèvement du coût de la recette', () => {
    expect(play(initialState, order('waraxe')).requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'forge:1:pay:alice',
        playerId: 'alice',
        resources: { wood: 50, stone: 40 },
      },
    ])
  })

  it('refuse la commande si le Village refuse le prélèvement, sans aucun remboursement', () => {
    const { state, events, requests } = play(ordered, result(1, 'refused', { stone: 4 }))
    expect(events[0]).toMatchObject({ type: 'OrderRejected', data: { missing: { stone: 4 } } })
    expect(requests).toEqual([])
    expect(state.current).toBeNull()
    expect(state.setback).toEqual({
      number: 1,
      recipe: 'dagger',
      outcome: 'rejected',
      missing: { stone: 4 },
    })
  })

  it('ignore une réponse en double, ou une réponse qui ne concerne pas la commande en cours', () => {
    expect(play(forging, result(1, 'withdrawn')).events).toEqual([])
    expect(play(ordered, result(2, 'withdrawn')).events).toEqual([])
    expect(
      play(ordered, {
        type: 'RecordTransferResult',
        number: 1,
        step: 'refund',
        outcome: 'deposited',
      }).events,
    ).toEqual([])
  })
})

describe('Forge - règle 5 : la pièce est récupérable seulement à son échéance', () => {
  it('fait courir la durée de forge à partir du paiement', () => {
    const paidLater = play(ordered, result(1, 'withdrawn'), T0 + 5_000).state
    expect(paidLater.current).toMatchObject({ status: 'forging', readyAt: READY_AT + 5_000 })
  })

  it("refuse la récupération pendant le paiement et avant l'échéance", () => {
    expect(decide(ordered, { type: 'CollectItem' }, T0)).toMatchObject({
      error: { code: 'PAYMENT_PENDING' },
    })
    expect(decide(forging, { type: 'CollectItem' }, READY_AT - 1)).toEqual({
      ok: false,
      error: { code: 'NOT_READY', readyAt: READY_AT },
    })
    expect(decide(initialState, { type: 'CollectItem' }, T0)).toMatchObject({
      error: { code: 'NO_ORDER' },
    })
  })

  it("présente la pièce comme prête dès l'échéance, sans qu'aucun événement ne l'enregistre", () => {
    expect(toView(forging, READY_AT - 1).current?.status).toBe('forging')
    expect(toView(forging, READY_AT).current?.status).toBe('ready')
  })
})

describe('Forge - règle 6 : une annulation avant la fin de la forge est remboursée', () => {
  it('rembourse intégralement le coût payé (compensation de la saga)', () => {
    const { state, requests } = play(forging, { type: 'CancelOrder' }, READY_AT - 1)
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'forge:1:refund:alice',
        playerId: 'alice',
        resources: { wood: 30, stone: 10 },
      },
    ])
    expect(state.current).toBeNull()
    expect(state.setback).toMatchObject({ outcome: 'cancelled', missing: null })
  })

  it("refuse l'annulation pendant le paiement, et une fois la pièce prête", () => {
    expect(decide(ordered, { type: 'CancelOrder' }, T0)).toMatchObject({
      error: { code: 'PAYMENT_PENDING' },
    })
    expect(decide(forging, { type: 'CancelOrder' }, READY_AT)).toMatchObject({
      error: { code: 'ALREADY_READY' },
    })
    expect(decide(initialState, { type: 'CancelOrder' }, T0)).toMatchObject({
      error: { code: 'NO_ORDER' },
    })
  })
})

describe("Forge - règle 7 : une pièce récupérée entre dans l'armurerie et fait progresser le rang", () => {
  it('ajoute la pièce, avec le poinçon du forgeron, à la puissance et au rang', () => {
    const { state } = play(forging, { type: 'CollectItem' }, READY_AT)
    expect(state.armory).toEqual([
      { number: 1, recipe: 'dagger', smithName: 'Alice', forgedAt: READY_AT },
    ])
    const view = toView(smithWith(3), T0)
    expect(view).toMatchObject({
      rank: 'journeyman',
      nextRank: { rank: 'master', remaining: 2 },
      power: 3 * CATALOG.dagger.power,
    })
    expect(view.recipes.find((r) => r.recipe === 'runehammer')?.unlocked).toBe(true)
    expect(view.recipes.find((r) => r.recipe === 'kingsblade')?.unlocked).toBe(false)
  })
})

describe('Forge - identifiants des mouvements de ressources', () => {
  it("construit et décompose l'identifiant, y compris pour un joueur dont l'identifiant contient « : »", () => {
    expect(transferIdOf('alice', 3, 'pay')).toBe('forge:3:pay:alice')
    expect(parseTransferId('forge:3:pay:a:b')).toEqual({ playerId: 'a:b', number: 3, step: 'pay' })
  })

  it("rejette un identifiant qui n'est pas celui d'un mouvement de la Forge", () => {
    for (const id of ['o1:reserve', 'forge:0:pay:alice', 'forge:x:pay:alice', 'forge:1:pay:']) {
      expect(parseTransferId(id)).toBeNull()
    }
  })
})
