/**
 * Étapes de la saga de paiement d'une commande : pour chaque événement de l'atelier, les
 * demandes à adresser au Village. Le domaine décide de ces demandes ; le service les traduit
 * en messages de la boîte d'envoi.
 */
import type { Amounts } from './catalog'
import { type ForgeEvent, type ForgeState, transferIdOf } from './forge'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse fait progresser la saga. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Demandes déclenchées par un événement de l'atelier d'un joueur. L'état reçu est celui qui
 * précède l'application de l'événement : il contient encore la commande annulée.
 */
export function requestsFor(
  playerId: string,
  before: ForgeState,
  event: ForgeEvent,
): SagaRequest[] {
  switch (event.type) {
    // 1. Commande : prélèvement du coût dans le village du joueur (étape compensable).
    case 'OrderPlaced':
      return [
        {
          kind: 'withdraw',
          transferId: transferIdOf(playerId, event.data.number, 'pay'),
          playerId,
          resources: event.data.cost,
        },
      ]

    // Compensation : l'annulation rembourse le coût payé, tel qu'il a été prélevé.
    case 'OrderCancelled':
      return before.current
        ? [
            {
              kind: 'deposit',
              transferId: transferIdOf(playerId, event.data.number, 'refund'),
              playerId,
              resources: before.current.cost,
            },
          ]
        : []

    // Paiement accepté ou refusé, pièce récupérée : aucun mouvement de ressources.
    case 'OrderPaid':
    case 'OrderRejected':
    case 'ItemCollected':
      return []
  }
}
