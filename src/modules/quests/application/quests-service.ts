import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import type { TavernActivity } from '../contracts'
import { dayOf, startOfDay } from '../domain/board'
import {
  decide,
  type PlayerContext,
  type QuestCommand,
  type QuestError,
  type QuestEvent,
} from '../domain/quests'
import { depositsFor } from '../domain/saga'
import { type QuestBoardView, toView } from '../domain/view'
import type { ActivityReader, QuestLogRepository } from './ports'

/** Résultat d'une commande : la vue du tableau, ou l'erreur métier. */
export type CommandResult = { ok: true; view: QuestBoardView } | { ok: false; error: QuestError }

export interface QuestsServiceOptions {
  /** Lecture de l'activité de la Taverne, qui n'enregistre pas d'événements. */
  tavern: TavernActivity
  /** Distribution de la boîte d'envoi, déclenchée après chaque récompense. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Versements de l'or des récompenses, adressés au Village. */
function messagesFor(playerId: string, events: QuestEvent[]): NewMessage[] {
  return events.flatMap((event) =>
    depositsFor(playerId, event).map((deposit) => ({
      topic: REALM_TOPICS.deposit,
      payload: { ...deposit },
    })),
  )
}

/**
 * Service applicatif des Quêtes du jour : il réunit l'activité du joueur (projection et Taverne),
 * présente son tableau, et enregistre ses récompenses avec les versements qu'elles déclenchent.
 */
export function createQuestsService(
  repo: QuestLogRepository,
  reader: ActivityReader,
  { tavern, dispatch, clock = () => Date.now() }: QuestsServiceOptions,
) {
  /** Ce que le joueur a fait aujourd'hui, toutes sources réunies. */
  async function contextOf(playerId: string, now: number): Promise<PlayerContext> {
    const day = dayOf(now)
    const [counts, messages, hasVillage] = await Promise.all([
      reader.activityOf(playerId, day),
      tavern.messagesSince(playerId, startOfDay(day)),
      reader.hasVillage(playerId),
    ])
    return { playerId, activity: { ...counts, message: messages }, hasVillage }
  }

  /** Tableau des quêtes du jour d'un joueur. */
  async function board(playerId: string) {
    const now = clock()
    const [{ state }, context] = await Promise.all([repo.load(playerId), contextOf(playerId, now)])
    return toView(state, playerId, context.activity, context.hasVillage, now)
  }

  /** Décide et enregistre une commande, avec ses versements ; puis distribue la boîte d'envoi. */
  async function execute(
    playerId: string,
    command: (context: PlayerContext) => QuestCommand,
  ): Promise<CommandResult> {
    const decision = await withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const now = clock()
      const result = decide(state, command(await contextOf(playerId, now)), now)
      if (!result.ok) return result
      await repo.save(playerId, version, result.events, messagesFor(playerId, result.events))
      return result
    })
    if (!decision.ok) return decision
    // L'or est versé pendant la requête : le joueur le voit arriver dans son village.
    await dispatch()
    return { ok: true, view: await board(playerId) }
  }

  /** Récupère la récompense d'une quête accomplie. */
  const claim = (playerId: string, questId: string) =>
    execute(playerId, (context) => ({ type: 'ClaimReward', questId, context }))

  /** Ouvre le coffre du jour. */
  const openChest = (playerId: string) =>
    execute(playerId, (context) => ({ type: 'OpenChest', context }))

  return { board, claim, openChest }
}

/** Type du service, déduit de sa fabrique. */
export type QuestsService = ReturnType<typeof createQuestsService>
