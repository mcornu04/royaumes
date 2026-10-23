/** Vue du tableau des quêtes d'un joueur, calculée à un instant donné. */

import { dailyQuests, dayOf, isDone, progressOf, startOfDay } from './board'
import { type ActivityCounts, CHEST_REWARD, type QuestSpec } from './catalog'
import type { QuestLogState } from './quests'

export interface QuestBoardView {
  day: number
  /** Instant du renouvellement des quêtes : minuit (UTC) suivant. */
  resetsAt: number
  quests: (QuestSpec & { progress: number; done: boolean; claimed: boolean })[]
  chest: { reward: number; claimed: number; ready: boolean; opened: boolean }
  /** Or reçu aujourd'hui, quêtes et coffre compris. */
  earnedToday: number
  hasVillage: boolean
  asOf: number
}

export function toView(
  state: QuestLogState,
  playerId: string,
  activity: ActivityCounts,
  hasVillage: boolean,
  now: number,
): QuestBoardView {
  const day = dayOf(now)
  const claimed = state.claimed[day] ?? []
  const quests = dailyQuests(playerId, day).map((quest) => ({
    ...quest,
    progress: progressOf(quest, activity),
    done: isDone(quest, activity),
    claimed: claimed.includes(quest.id),
  }))
  const opened = state.chests.includes(day)
  return {
    day,
    resetsAt: startOfDay(day + 1),
    quests,
    chest: {
      reward: CHEST_REWARD,
      claimed: claimed.length,
      ready: !opened && claimed.length === quests.length,
      opened,
    },
    earnedToday:
      quests.filter((q) => q.claimed).reduce((sum, q) => sum + q.reward, 0) +
      (opened ? CHEST_REWARD : 0),
    hasVillage,
    asOf: now,
  }
}
