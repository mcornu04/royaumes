/**
 * Domaine du Tournoi : un tournoi à élimination directe, selon le modèle decider.
 * Les inscriptions sont des événements ; les combats ne le sont pas : ils se déduisent de la
 * graine enregistrée au lancement (combat.ts). Ce fichier n'importe aucun autre module.
 */
import {
  BOTS,
  ENTRY_REQUIREMENTS,
  ROUND_MS,
  ROUNDS,
  SEATS,
  type Stats,
  type Tactic,
} from './catalog'
import { bracketOf, type ChampionProfile, statsOf } from './combat'
import { createRandom } from './random'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

/** Combattant inscrit : un joueur, ou un chevalier piloté par l'ordinateur. */
export interface Entrant {
  /** Identifiant du joueur ; null pour un chevalier piloté par l'ordinateur. */
  playerId: string | null
  name: string
  tactic: Tactic
  /** Caractéristiques figées à l'inscription : le combat ne dépend que du journal. */
  stats: Stats
}

export interface TournamentState {
  exists: boolean
  tournamentId: string
  hostId: string
  hostName: string
  status: 'open' | 'started'
  entrants: Entrant[]
  openedAt: number
  startedAt: number | null
  seed: number | null
  awarded: boolean
}

export const initialState: TournamentState = {
  exists: false,
  tournamentId: '',
  hostId: '',
  hostName: '',
  status: 'open',
  entrants: [],
  openedAt: 0,
  startedAt: null,
  seed: null,
  awarded: false,
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type TournamentEvent =
  | {
      type: 'TournamentOpened'
      data: {
        tournamentId: string
        hostId: string
        hostName: string
        tactic: Tactic
        stats: Stats
        at: number
      }
    }
  | {
      type: 'EntrantJoined'
      data: { playerId: string; name: string; tactic: Tactic; stats: Stats; at: number }
    }
  | {
      type: 'TournamentStarted'
      data: { seed: number; bots: { name: string; tactic: Tactic; stats: Stats }[]; at: number }
    }
  | {
      type: 'PrizesAwarded'
      data: { championId: string | null; finalistId: string | null; at: number }
    }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

/** Joueur à l'origine d'une inscription, avec ce que le Tournoi sait de lui. */
export interface Applicant {
  playerId: string
  name: string
  tactic: Tactic
  /** Profil du joueur ; null s'il n'a ni village ni pièce forgée. */
  profile: ChampionProfile | null
}

export type TournamentCommand =
  | { type: 'OpenTournament'; tournamentId: string; applicant: Applicant }
  | { type: 'JoinTournament'; applicant: Applicant }
  | { type: 'StartTournament'; playerId: string; seed: number }
  // Commande issue du rappel différé, à la fin du tournoi.
  | { type: 'AwardPrizes' }

/** Condition d'entrée non remplie. */
export type Shortfall =
  | { kind: 'building'; building: 'sawmill' | 'quarry' | 'mine'; level: number; required: number }
  | { kind: 'forge'; forged: number; required: number }

export type TournamentError =
  | { code: 'NOT_ELIGIBLE'; shortfalls: Shortfall[] }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'TOURNAMENT_NOT_FOUND' }
  | { code: 'NOT_OPEN' }
  | { code: 'ALREADY_JOINED' }
  | { code: 'FULL' }
  | { code: 'NOT_HOST' }
  | { code: 'NOT_FINISHED' }

export type Decision =
  | { ok: true; events: TournamentEvent[] }
  | { ok: false; error: TournamentError }

const fail = (error: TournamentError): Decision => ({ ok: false, error })
const accept = (...events: TournamentEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Conditions d'entrée et calendrier
// ---------------------------------------------------------------------------

/**
 * Conditions d'entrée que le joueur ne remplit pas encore : chaque bâtiment de son village
 * au niveau requis, et assez de pièces forgées. Une liste vide signifie qu'il est admis.
 */
export function shortfallsOf(profile: ChampionProfile | null): Shortfall[] {
  const levels = profile?.levels ?? { sawmill: 0, quarry: 0, mine: 0 }
  const forged = profile?.forged ?? 0
  const required = ENTRY_REQUIREMENTS.buildingLevel
  const shortfalls: Shortfall[] = []
  for (const building of ['sawmill', 'quarry', 'mine'] as const) {
    if (levels[building] < required) {
      shortfalls.push({ kind: 'building', building, level: levels[building], required })
    }
  }
  if (forged < ENTRY_REQUIREMENTS.forgedPieces) {
    shortfalls.push({ kind: 'forge', forged, required: ENTRY_REQUIREMENTS.forgedPieces })
  }
  return shortfalls
}

/** Instant auquel le dernier tour est dévoilé, et le tournoi terminé. */
export const finishedAt = (startedAt: number) => startedAt + ROUNDS * ROUND_MS

/** Combattants du tableau, dans l'ordre des places. */
export const fightersOf = (state: TournamentState) =>
  state.entrants.map((entrant) => ({ stats: entrant.stats, tactic: entrant.tactic }))

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: TournamentState, event: TournamentEvent): TournamentState {
  switch (event.type) {
    case 'TournamentOpened': {
      const { tournamentId, hostId, hostName, tactic, stats, at } = event.data
      return {
        ...initialState,
        exists: true,
        tournamentId,
        hostId,
        hostName,
        entrants: [{ playerId: hostId, name: hostName, tactic, stats }],
        openedAt: at,
      }
    }
    case 'EntrantJoined': {
      const { playerId, name, tactic, stats } = event.data
      return { ...state, entrants: [...state.entrants, { playerId, name, tactic, stats }] }
    }
    case 'TournamentStarted':
      return {
        ...state,
        status: 'started',
        startedAt: event.data.at,
        seed: event.data.seed,
        entrants: [
          ...state.entrants,
          ...event.data.bots.map((bot) => ({ ...bot, playerId: null })),
        ],
      }
    case 'PrizesAwarded':
      return { ...state, awarded: true }
  }
}

export const replay = (events: TournamentEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: TournamentState, command: TournamentCommand, now: number): Decision {
  if (command.type === 'OpenTournament') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { applicant } = command
    // Règle 1 : seuls les joueurs qui remplissent les conditions d'entrée s'inscrivent.
    const shortfalls = shortfallsOf(applicant.profile)
    if (shortfalls.length > 0) return fail({ code: 'NOT_ELIGIBLE', shortfalls })
    return accept({
      type: 'TournamentOpened',
      data: {
        tournamentId: command.tournamentId,
        hostId: applicant.playerId,
        hostName: applicant.name,
        tactic: applicant.tactic,
        stats: statsOf(applicant.profile as ChampionProfile),
        at: now,
      },
    })
  }

  if (!state.exists) return fail({ code: 'TOURNAMENT_NOT_FOUND' })

  switch (command.type) {
    case 'JoinTournament': {
      const { applicant } = command
      // Règle 2 : on ne rejoint qu'un tournoi ouvert, une seule fois, dans la limite des places.
      if (state.status !== 'open') return fail({ code: 'NOT_OPEN' })
      if (state.entrants.some((e) => e.playerId === applicant.playerId)) {
        return fail({ code: 'ALREADY_JOINED' })
      }
      if (state.entrants.length >= SEATS) return fail({ code: 'FULL' })
      const shortfalls = shortfallsOf(applicant.profile)
      if (shortfalls.length > 0) return fail({ code: 'NOT_ELIGIBLE', shortfalls })
      return accept({
        type: 'EntrantJoined',
        data: {
          playerId: applicant.playerId,
          name: applicant.name,
          tactic: applicant.tactic,
          stats: statsOf(applicant.profile as ChampionProfile),
          at: now,
        },
      })
    }

    case 'StartTournament': {
      // Règle 3 : seul l'hôte lance le tournoi ; les places vides sont prises par des
      // chevaliers pilotés par l'ordinateur, tirés au sort à partir de la graine.
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      if (state.status !== 'open') return fail({ code: 'NOT_OPEN' })
      const bots = createRandom(command.seed)
        .shuffle(BOTS)
        .slice(0, SEATS - state.entrants.length)
      return accept({ type: 'TournamentStarted', data: { seed: command.seed, bots, at: now } })
    }

    case 'AwardPrizes': {
      // Règle 6 : les récompenses sont versées une seule fois, après le dernier tour.
      if (state.awarded) return accept()
      if (state.status !== 'started' || state.startedAt === null || state.seed === null) {
        return fail({ code: 'NOT_FINISHED' })
      }
      if (now < finishedAt(state.startedAt)) return fail({ code: 'NOT_FINISHED' })
      const final = bracketOf(fightersOf(state), state.seed)[ROUNDS - 1]?.[0]
      if (!final) return fail({ code: 'NOT_FINISHED' })
      const finalist = final.winner === final.a ? final.b : final.a
      return accept({
        type: 'PrizesAwarded',
        data: {
          championId: state.entrants[final.winner]?.playerId ?? null,
          finalistId: state.entrants[finalist]?.playerId ?? null,
          at: now,
        },
      })
    }
  }
}
