/**
 * Domaine des Quêtes du jour : les récompenses récupérées par un joueur, selon le modèle decider.
 * L'avancement des quêtes n'est pas un événement : il se lit dans l'activité du joueur, que la
 * couche application fournit avec chaque commande. Ce fichier n'importe aucun autre module.
 */

import { dailyQuests, dayOf, isDone } from './board'
import { type ActivityCounts, CHEST_REWARD } from './catalog'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface QuestLogState {
  /** Quêtes dont la récompense a été récupérée, par jour. */
  claimed: Record<number, string[]>
  /** Jours dont le coffre a été ouvert. */
  chests: number[]
}

export const initialState: QuestLogState = { claimed: {}, chests: [] }

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type QuestEvent =
  | {
      type: 'QuestRewardClaimed'
      data: { day: number; questId: string; reward: number; at: number }
    }
  | { type: 'DailyChestOpened'; data: { day: number; reward: number; at: number } }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

/** Ce que le joueur a fait aujourd'hui, et s'il a un village pour recevoir son or. */
export interface PlayerContext {
  playerId: string
  activity: ActivityCounts
  hasVillage: boolean
}

export type QuestCommand =
  | { type: 'ClaimReward'; questId: string; context: PlayerContext }
  | { type: 'OpenChest'; context: PlayerContext }

export type QuestError =
  | { code: 'QUEST_NOT_TODAY' }
  | { code: 'NOT_COMPLETED' }
  | { code: 'ALREADY_CLAIMED' }
  | { code: 'NO_VILLAGE' }
  | { code: 'CHEST_LOCKED' }
  | { code: 'ALREADY_OPENED' }

export type Decision = { ok: true; events: QuestEvent[] } | { ok: false; error: QuestError }

const fail = (error: QuestError): Decision => ({ ok: false, error })
const accept = (...events: QuestEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: QuestLogState, event: QuestEvent): QuestLogState {
  switch (event.type) {
    case 'QuestRewardClaimed': {
      const { day, questId } = event.data
      return {
        ...state,
        claimed: { ...state.claimed, [day]: [...(state.claimed[day] ?? []), questId] },
      }
    }
    case 'DailyChestOpened':
      return { ...state, chests: [...state.chests, event.data.day] }
  }
}

export const replay = (events: QuestEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: QuestLogState, command: QuestCommand, now: number): Decision {
  const day = dayOf(now)
  const { playerId, activity, hasVillage } = command.context
  const claimed = state.claimed[day] ?? []

  switch (command.type) {
    case 'ClaimReward': {
      // Règle 4 : seule une quête du jour peut être récompensée ; celles de la veille sont perdues.
      const quest = dailyQuests(playerId, day).find((q) => q.id === command.questId)
      if (!quest) return fail({ code: 'QUEST_NOT_TODAY' })
      // Règle 3 : la quête doit être accomplie.
      if (!isDone(quest, activity)) return fail({ code: 'NOT_COMPLETED' })
      if (claimed.includes(quest.id)) return fail({ code: 'ALREADY_CLAIMED' })
      // Règle 5 : l'or est versé au village du joueur, qui doit donc en avoir un.
      if (!hasVillage) return fail({ code: 'NO_VILLAGE' })
      return accept({
        type: 'QuestRewardClaimed',
        data: { day, questId: quest.id, reward: quest.reward, at: now },
      })
    }

    case 'OpenChest': {
      // Règle 6 : le coffre s'ouvre une fois les trois récompenses du jour récupérées.
      if (state.chests.includes(day)) return fail({ code: 'ALREADY_OPENED' })
      if (claimed.length < dailyQuests(playerId, day).length) return fail({ code: 'CHEST_LOCKED' })
      if (!hasVillage) return fail({ code: 'NO_VILLAGE' })
      return accept({ type: 'DailyChestOpened', data: { day, reward: CHEST_REWARD, at: now } })
    }
  }
}
