/**
 * Demandes déclenchées par les événements d'un tournoi : le rappel de sa fin, puis le versement
 * des récompenses au village des joueurs. Le service les traduit en messages de la boîte d'envoi.
 */
import { PRIZES } from './catalog'
import { finishedAt, type TournamentEvent, type TournamentState } from './tournament'

export type TournamentRequest =
  /** Rappel adressé au tournoi lui-même, à sa fin, pour verser les récompenses. */
  | { kind: 'award'; tournamentId: string; at: number }
  /** Versement d'une récompense au village d'un joueur ; il ne peut pas être refusé. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Record<string, number> }

/** Identifiant du versement d'une récompense : clé d'idempotence pour le Village. */
export const prizeTransferId = (tournamentId: string, place: 'champion' | 'finalist') =>
  `tournament:${tournamentId}:${place}`

/** Demandes déclenchées par un événement ; l'état reçu est celui qui précède l'événement. */
export function requestsFor(state: TournamentState, event: TournamentEvent): TournamentRequest[] {
  switch (event.type) {
    // Lancement : le tournoi se rappellera à sa fin, une fois le dernier tour dévoilé.
    case 'TournamentStarted':
      return [{ kind: 'award', tournamentId: state.tournamentId, at: finishedAt(event.data.at) }]

    // Fin : les joueurs du podium reçoivent leur récompense ; un chevalier piloté par
    // l'ordinateur n'a pas de village, et ne reçoit rien.
    case 'PrizesAwarded': {
      const requests: TournamentRequest[] = []
      const { championId, finalistId } = event.data
      if (championId) {
        requests.push({
          kind: 'deposit',
          transferId: prizeTransferId(state.tournamentId, 'champion'),
          playerId: championId,
          resources: { ...PRIZES.champion },
        })
      }
      if (finalistId) {
        requests.push({
          kind: 'deposit',
          transferId: prizeTransferId(state.tournamentId, 'finalist'),
          playerId: finalistId,
          resources: { ...PRIZES.finalist },
        })
      }
      return requests
    }

    case 'TournamentOpened':
    case 'EntrantJoined':
      return []
  }
}
