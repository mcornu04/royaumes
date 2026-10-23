import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { FORGE_TOPICS } from '../contracts'
import {
  decide,
  evolve,
  type ForgeCommand,
  type ForgeError,
  type ForgeEvent,
  type ForgeState,
} from '../domain/forge'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type ForgeView, toView } from '../domain/view'
import type { WorkshopRepository } from './workshop-repository'

/** Résultat d'une commande d'un joueur : la vue de son atelier, ou l'erreur métier. */
export type CommandResult = { ok: true; view: ForgeView } | { ok: false; error: ForgeError }

/** Joueur à l'origine d'une commande. */
export interface Player {
  id: string
  name: string
}

export interface ForgeServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Traduit une demande de la saga en message de la boîte d'envoi, adressé au Village. */
function toMessage(request: SagaRequest): NewMessage {
  const payload = {
    transferId: request.transferId,
    playerId: request.playerId,
    resources: request.resources,
  }
  return request.kind === 'withdraw'
    ? // Adresse de retour : la réponse du Village fera progresser la saga.
      {
        topic: REALM_TOPICS.withdraw,
        payload: { ...payload, replyTo: FORGE_TOPICS.transferResult },
      }
    : { topic: REALM_TOPICS.deposit, payload }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état de l'atelier. */
function messagesFor(playerId: string, state: ForgeState, events: ForgeEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    for (const request of requestsFor(playerId, current, event)) messages.push(toMessage(request))
    current = evolve(current, event)
  }
  return messages
}

/**
 * Service applicatif de la Forge : orchestrateur de la saga de paiement des commandes.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createForgeService(
  repo: WorkshopRepository,
  { dispatch, clock = () => Date.now() }: ForgeServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur l'atelier d'un joueur, avec les messages de la saga.
   * En cas de conflit de version, l'ensemble est rejoué sur l'état à jour.
   */
  function process(playerId: string, command: ForgeCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(
        playerId,
        version,
        decision.events,
        messagesFor(playerId, state, decision.events),
      )
      return decision
    })
  }

  /** Vue de l'atelier d'un joueur, à l'instant présent. */
  async function viewOf(playerId: string) {
    const { state } = await repo.load(playerId)
    return toView(state, clock())
  }

  /**
   * Commande d'un joueur : la décision est enregistrée, puis la boîte d'envoi distribuée.
   * Dans le cas ordinaire, le Village a déjà répondu lorsque la vue est renvoyée.
   */
  async function execute(playerId: string, command: ForgeCommand): Promise<CommandResult> {
    const decision = await process(playerId, command)
    if (!decision.ok) return decision
    await dispatch()
    return { ok: true, view: await viewOf(playerId) }
  }

  /** Commande une pièce, au nom d'un joueur dont le nom est gravé sur la pièce. */
  const placeOrder = (player: Player, recipe: string) =>
    execute(player.id, { type: 'PlaceOrder', recipe, smithName: player.name })

  /** Annule la commande en cours d'un joueur ; son coût lui est remboursé. */
  const cancelOrder = (playerId: string) => execute(playerId, { type: 'CancelOrder' })

  /** Récupère la pièce forgée d'un joueur, une fois son échéance passée. */
  const collectItem = (playerId: string) => execute(playerId, { type: 'CollectItem' })

  /**
   * Vue de l'atelier. La boîte d'envoi est d'abord distribuée : un paiement interrompu
   * reprend dès que le joueur consulte sa forge.
   */
  async function getView(playerId: string) {
    // DETTE TECHNIQUE (docs/qualite/dette-technique.md, Forge) : chaque consultation distribue
    // toute la boîte d'envoi, y compris les messages des autres modules et des autres joueurs.
    await dispatch()
    return viewOf(playerId)
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(playerId: string, command: ForgeCommand) {
    const decision = await process(playerId, command)
    if (!decision.ok) throw new Error(`Forge de ${playerId} : ${decision.error.code}`)
  }

  return { placeOrder, cancelOrder, collectItem, getView, step }
}

/** Type du service, déduit de sa fabrique. */
export type ForgeService = ReturnType<typeof createForgeService>
