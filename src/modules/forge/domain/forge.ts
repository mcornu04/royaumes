/**
 * Domaine de la Forge : l'atelier d'un joueur, selon le modèle decider.
 * Une commande suit le cycle paiement, forge, puis récupération ; son paiement est une saga
 * avec le Village (saga.ts). Ce fichier est écrit en TypeScript pur : il n'importe aucun
 * autre module.
 */
import {
  type Amounts,
  CATALOG,
  isRecipe,
  RANK_THRESHOLDS,
  RANKS,
  type Rank,
  type Recipe,
} from './catalog'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

/** Commande en cours : en attente du paiement, puis à la forge. */
export interface Order {
  /** Numéro de la commande dans l'atelier : 1, 2, 3... */
  number: number
  recipe: Recipe
  /** Nom du forgeron, gravé sur la pièce (poinçon). */
  smithName: string
  /** Coût payé, copié de la recette au moment de la commande : il est remboursé tel quel. */
  cost: Amounts
  durationMs: number
  status: 'paying' | 'forging'
  /** Instant à partir duquel la pièce peut être récupérée ; null tant qu'elle n'est pas payée. */
  readyAt: number | null
}

/** Pièce récupérée, exposée dans l'armurerie. */
export interface ForgedItem {
  number: number
  recipe: Recipe
  smithName: string
  forgedAt: number
}

/** Issue de la dernière commande qui n'a pas abouti à une pièce. */
export interface Setback {
  number: number
  recipe: Recipe
  outcome: 'rejected' | 'cancelled'
  /** Ressources qui manquaient au village, en cas de refus du paiement. */
  missing: Amounts | null
}

export interface ForgeState {
  /** Nombre de commandes passées : le numéro de la prochaine commande s'en déduit. */
  orders: number
  current: Order | null
  armory: ForgedItem[]
  setback: Setback | null
}

export const initialState: ForgeState = { orders: 0, current: null, armory: [], setback: null }

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type ForgeEvent =
  | {
      type: 'OrderPlaced'
      data: {
        number: number
        recipe: Recipe
        smithName: string
        cost: Amounts
        durationMs: number
        at: number
      }
    }
  | { type: 'OrderPaid'; data: { number: number; readyAt: number; at: number } }
  | { type: 'OrderRejected'; data: { number: number; missing: Amounts; at: number } }
  | { type: 'OrderCancelled'; data: { number: number; at: number } }
  | {
      type: 'ItemCollected'
      data: { number: number; recipe: Recipe; smithName: string; at: number }
    }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type ForgeCommand =
  // Commandes du joueur.
  | { type: 'PlaceOrder'; recipe: string; smithName: string }
  | { type: 'CancelOrder' }
  | { type: 'CollectItem' }
  // Commande de la saga, issue de la réponse du Village.
  | {
      type: 'RecordTransferResult'
      number: number
      step: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }

export type ForgeError =
  | { code: 'UNKNOWN_RECIPE' }
  | { code: 'FORGE_BUSY' }
  | { code: 'RANK_TOO_LOW'; required: Rank }
  | { code: 'NO_ORDER' }
  | { code: 'PAYMENT_PENDING' }
  | { code: 'NOT_READY'; readyAt: number }
  | { code: 'ALREADY_READY' }

export type Decision = { ok: true; events: ForgeEvent[] } | { ok: false; error: ForgeError }

const fail = (error: ForgeError): Decision => ({ ok: false, error })
const accept = (...events: ForgeEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Rang du forgeron
// ---------------------------------------------------------------------------

/** Rang atteint avec un nombre donné de pièces forgées. */
export function rankOf(forged: number): Rank {
  let rank: Rank = 'apprentice'
  for (const candidate of RANKS) if (forged >= RANK_THRESHOLDS[candidate]) rank = candidate
  return rank
}

/** Indique si un rang est au moins égal à un rang requis. */
export const reaches = (rank: Rank, required: Rank) =>
  RANKS.indexOf(rank) >= RANKS.indexOf(required)

// ---------------------------------------------------------------------------
// Identifiants des mouvements de ressources
// ---------------------------------------------------------------------------

/**
 * Identifiant d'un mouvement de ressources : il est déterminé par le joueur, la commande et
 * l'étape de la saga, et sert de clé d'idempotence au Village. Le préfixe « forge » le distingue
 * des mouvements du Marché ; l'identifiant du joueur vient en dernier, car il est opaque.
 */
export const transferIdOf = (playerId: string, number: number, step: 'pay' | 'refund') =>
  `forge:${number}:${step}:${playerId}`

/** Décompose un identifiant de mouvement de la Forge ; null s'il n'en est pas un. */
export function parseTransferId(transferId: string) {
  const [prefix, number, step, ...rest] = transferId.split(':')
  const playerId = rest.join(':')
  if (prefix !== 'forge' || !step || !playerId || !/^[1-9]\d*$/.test(number ?? '')) return null
  return { playerId, number: Number(number), step }
}

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: ForgeState, event: ForgeEvent): ForgeState {
  switch (event.type) {
    case 'OrderPlaced': {
      const { number, recipe, smithName, cost, durationMs } = event.data
      return {
        ...state,
        orders: number,
        current: { number, recipe, smithName, cost, durationMs, status: 'paying', readyAt: null },
        setback: null,
      }
    }
    case 'OrderPaid':
      return state.current
        ? {
            ...state,
            current: { ...state.current, status: 'forging', readyAt: event.data.readyAt },
          }
        : state
    case 'OrderRejected':
      return state.current
        ? {
            ...state,
            current: null,
            setback: {
              number: state.current.number,
              recipe: state.current.recipe,
              outcome: 'rejected',
              missing: event.data.missing,
            },
          }
        : state
    case 'OrderCancelled':
      return state.current
        ? {
            ...state,
            current: null,
            setback: {
              number: state.current.number,
              recipe: state.current.recipe,
              outcome: 'cancelled',
              missing: null,
            },
          }
        : state
    case 'ItemCollected': {
      const { number, recipe, smithName, at } = event.data
      return {
        ...state,
        current: null,
        armory: [...state.armory, { number, recipe, smithName, forgedAt: at }],
      }
    }
  }
}

export const replay = (events: ForgeEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: ForgeState, command: ForgeCommand, now: number): Decision {
  const current = state.current

  switch (command.type) {
    case 'PlaceOrder': {
      // Règle 1 : seules les recettes du catalogue peuvent être commandées.
      if (!isRecipe(command.recipe)) return fail({ code: 'UNKNOWN_RECIPE' })
      // Règle 2 : la forge ne fabrique qu'une pièce à la fois.
      if (current) return fail({ code: 'FORGE_BUSY' })
      // Règle 3 : la recette exige un rang suffisant.
      const spec = CATALOG[command.recipe]
      if (!reaches(rankOf(state.armory.length), spec.rank)) {
        return fail({ code: 'RANK_TOO_LOW', required: spec.rank })
      }
      return accept({
        type: 'OrderPlaced',
        data: {
          number: state.orders + 1,
          recipe: command.recipe,
          smithName: command.smithName,
          cost: spec.cost,
          durationMs: spec.durationMs,
          at: now,
        },
      })
    }

    case 'CancelOrder':
      if (!current) return fail({ code: 'NO_ORDER' })
      // Le prélèvement est en cours : rien ne peut encore être remboursé.
      if (current.status === 'paying') return fail({ code: 'PAYMENT_PENDING' })
      // Règle 6 : l'annulation n'est possible qu'avant la fin de la forge.
      if (current.readyAt !== null && now >= current.readyAt) return fail({ code: 'ALREADY_READY' })
      return accept({ type: 'OrderCancelled', data: { number: current.number, at: now } })

    case 'CollectItem':
      if (!current) return fail({ code: 'NO_ORDER' })
      if (current.status === 'paying') return fail({ code: 'PAYMENT_PENDING' })
      // Règle 5 : la pièce n'est récupérable qu'à son échéance, vérifiée à la commande
      // du joueur (échéance paresseuse, sans tâche de fond).
      if (current.readyAt === null || now < current.readyAt) {
        return fail({ code: 'NOT_READY', readyAt: current.readyAt ?? now + current.durationMs })
      }
      return accept({
        type: 'ItemCollected',
        data: {
          number: current.number,
          recipe: current.recipe,
          smithName: current.smithName,
          at: now,
        },
      })

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

/**
 * Réponse du Village au prélèvement d'une commande. Seule la réponse attendue dans l'état
 * courant fait progresser la saga ; toute autre réponse (doublon, réponse tardive) est ignorée.
 */
function recordTransferResult(
  state: ForgeState,
  result: Extract<ForgeCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const current = state.current
  // Seule la réponse au prélèvement de la commande en attente de paiement est attendue.
  if (current?.status !== 'paying' || result.step !== 'pay' || result.number !== current.number) {
    return accept()
  }
  // Règle 4 : un stock insuffisant refuse la commande, sans rien prélever.
  if (result.outcome === 'refused') {
    return accept({
      type: 'OrderRejected',
      data: { number: current.number, missing: result.missing ?? {}, at: now },
    })
  }
  // Le temps de forge court à partir du paiement.
  return accept({
    type: 'OrderPaid',
    data: { number: current.number, readyAt: now + current.durationMs, at: now },
  })
}
