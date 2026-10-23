/**
 * Versements déclenchés par les récompenses : l'or d'une quête, ou du coffre, est versé au
 * village du joueur. Le versement ne peut pas être refusé ; aucune réponse n'est attendue.
 */
import type { QuestEvent } from './quests'

export interface DepositRequest {
  transferId: string
  playerId: string
  resources: { gold: number }
}

/**
 * Identifiant d'un versement : clé d'idempotence pour le Village. Le préfixe « quest » le
 * distingue des mouvements des autres modules ; l'identifiant du joueur vient en dernier.
 */
export const rewardTransferId = (day: number, item: string, playerId: string) =>
  `quest:${day}:${item}:${playerId}`

export function depositsFor(playerId: string, event: QuestEvent): DepositRequest[] {
  switch (event.type) {
    case 'QuestRewardClaimed':
      return [
        {
          transferId: rewardTransferId(event.data.day, event.data.questId, playerId),
          playerId,
          resources: { gold: event.data.reward },
        },
      ]
    case 'DailyChestOpened':
      return [
        {
          transferId: rewardTransferId(event.data.day, 'chest', playerId),
          playerId,
          resources: { gold: event.data.reward },
        },
      ]
  }
}
