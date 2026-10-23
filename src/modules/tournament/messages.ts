import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { TournamentService } from './application/tournament-service'
import { TOURNAMENT_TOPICS } from './contracts'

/** Rappel différé d'un tournoi, à sa fin. */
const AwardMessage = z.object({ tournamentId: z.string().min(1) })

/**
 * Gestionnaires des messages adressés au Tournoi : le rappel de fin de tournoi, qui verse les
 * récompenses. Le gestionnaire est idempotent : un tournoi déjà récompensé ne l'est pas deux fois.
 */
export function createTournamentHandlers(
  service: TournamentService,
): Record<string, MessageHandler> {
  return {
    [TOURNAMENT_TOPICS.award]: async (message) => {
      const { tournamentId } = AwardMessage.parse(message.payload)
      await service.step(tournamentId, { type: 'AwardPrizes' })
    },
  }
}
