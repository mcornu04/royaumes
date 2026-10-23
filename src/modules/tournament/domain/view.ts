/** Vue d'un tournoi pour un joueur, calculée à un instant donné. */
import { ROUND_MS, ROUNDS, SEATS, type Stats, type Tactic } from './catalog'
import { bracketOf, type Exchange } from './combat'
import { fightersOf, type TournamentState } from './tournament'

/** Match tel qu'il est présenté : le vainqueur n'est connu qu'une fois le tour terminé. */
export interface MatchView {
  a: number
  b: number
  winner: number | null
  exchanges: Exchange[]
}

export interface TournamentView {
  tournamentId: string
  hostName: string
  isHost: boolean
  /** Vrai si le joueur qui consulte la vue est inscrit. */
  joined: boolean
  status: 'open' | 'running' | 'finished'
  entrants: {
    seat: number
    name: string
    bot: boolean
    tactic: Tactic
    stats: Stats
    isMe: boolean
  }[]
  seatsLeft: number
  /**
   * Tour en cours : 0 pour les quarts, 1 pour les demies, 2 pour la finale, 3 une fois le tournoi
   * terminé. Calculé à la lecture : chaque tour se termine à son échéance (échéance paresseuse).
   */
  round: number
  roundStartedAt: number | null
  roundEndsAt: number | null
  /** Tours dévoilés : les tours terminés, et le tour en cours, dont l'issue reste masquée. */
  rounds: MatchView[][]
  /** Place du champion, une fois la finale terminée. */
  champion: number | null
  asOf: number
}

export function toView(
  state: TournamentState,
  viewerId: string,
  now: number,
): TournamentView | null {
  if (!state.exists) return null
  const entrants = state.entrants.map((entrant, seat) => ({
    seat,
    name: entrant.name,
    bot: entrant.playerId === null,
    tactic: entrant.tactic,
    stats: entrant.stats,
    isMe: entrant.playerId === viewerId,
  }))
  const base = {
    tournamentId: state.tournamentId,
    hostName: state.hostName,
    isHost: state.hostId === viewerId,
    joined: entrants.some((entrant) => entrant.isMe),
    entrants,
    seatsLeft: SEATS - state.entrants.length,
    asOf: now,
  }

  if (state.status === 'open' || state.startedAt === null || state.seed === null) {
    return {
      ...base,
      status: 'open',
      round: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      rounds: [],
      champion: null,
    }
  }

  const round = Math.min(ROUNDS, Math.floor((now - state.startedAt) / ROUND_MS))
  const bracket = bracketOf(fightersOf(state), state.seed)
  const rounds = bracket
    .slice(0, Math.min(round + 1, ROUNDS))
    .map((matches, index) =>
      matches.map((match) => ({ ...match, winner: index < round ? match.winner : null })),
    )
  const finished = round >= ROUNDS
  const final = bracket[ROUNDS - 1]?.[0]
  return {
    ...base,
    status: finished ? 'finished' : 'running',
    round,
    roundStartedAt: finished ? null : state.startedAt + round * ROUND_MS,
    roundEndsAt: finished ? null : state.startedAt + (round + 1) * ROUND_MS,
    rounds,
    champion: finished && final ? final.winner : null,
  }
}
