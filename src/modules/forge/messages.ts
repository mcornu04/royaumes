import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { ForgeService } from './application/forge-service'
import { FORGE_TOPICS } from './contracts'
import { parseTransferId } from './domain/forge'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaires des messages adressés à la Forge : les réponses du Village, qui font
 * progresser la saga de paiement. Ils ne font que traduire un message en appel au service.
 */
export function createForgeHandlers(service: ForgeService): Record<string, MessageHandler> {
  return {
    [FORGE_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par la Forge : il désigne le joueur et la
      // commande. Un identifiant étranger est une anomalie, et finira en lettre morte.
      const transfer = parseTransferId(transferId)
      if (!transfer) throw new Error(`Mouvement inconnu de la Forge : ${transferId}`)
      await service.step(transfer.playerId, {
        type: 'RecordTransferResult',
        number: transfer.number,
        step: transfer.step,
        outcome,
        missing,
      })
    },
  }
}
