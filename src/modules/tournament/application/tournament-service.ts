import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { type Eligibility, TOURNAMENT_TOPICS } from '../contracts'
import type { Tactic } from '../domain/catalog'
import { type ChampionProfile, statsOf } from '../domain/combat'
import { requestsFor, type TournamentRequest } from '../domain/saga'
import {
  decide,
  evolve,
  shortfallsOf,
  type TournamentCommand,
  type TournamentError,
  type TournamentEvent,
  type TournamentState,
} from '../domain/tournament'
import { type TournamentView, toView } from '../domain/view'
import type { TournamentReader, TournamentRepository } from './ports'

/** Résultat d'une commande d'un joueur : la vue du tournoi, ou l'erreur métier. */
export type CommandResult =
  | { ok: true; view: TournamentView }
  | { ok: false; error: TournamentError }

/** Joueur à l'origine d'une commande. */
export interface Player {
  id: string
  name: string
}

export interface TournamentServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'un nouveau tournoi ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine des combats d'un tournoi lancé ; un entier aléatoire par défaut. */
  newSeed?: () => number
}

/** Profil d'un joueur sans aucune progression. */
const EMPTY_PROFILE: ChampionProfile = {
  levels: { sawmill: 0, quarry: 0, mine: 0 },
  forged: 0,
  power: 0,
}

/** Traduit une demande du domaine en message de la boîte d'envoi. */
function toMessage(request: TournamentRequest, now: number): NewMessage {
  switch (request.kind) {
    case 'award':
      return {
        topic: TOURNAMENT_TOPICS.award,
        payload: { tournamentId: request.tournamentId },
        delayMs: Math.max(0, request.at - now),
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état du tournoi. */
function messagesFor(state: TournamentState, events: TournamentEvent[], now: number) {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    for (const request of requestsFor(current, event)) messages.push(toMessage(request, now))
    current = evolve(current, event)
  }
  return messages
}

/**
 * Service applicatif du Tournoi : inscriptions, lancement, et récompenses de fin de tournoi.
 * Le profil des joueurs est lu dans le modèle de lecture tenu par la projection du Tournoi.
 */
export function createTournamentService(
  repo: TournamentRepository,
  reader: TournamentReader,
  {
    dispatch,
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => Math.floor(Math.random() * 2 ** 31),
  }: TournamentServiceOptions,
) {
  /** Décide et enregistre une commande, avec les messages qu'elle déclenche. */
  function process(tournamentId: string, command: TournamentCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(tournamentId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(
        tournamentId,
        version,
        decision.events,
        messagesFor(state, decision.events, now),
      )
      return decision
    })
  }

  /** Vue d'un tournoi pour un joueur ; null s'il n'existe pas. */
  async function getView(tournamentId: string, viewerId: string) {
    // Une distribution préalable verse les récompenses d'un tournoi terminé.
    await dispatch()
    const { state } = await repo.load(tournamentId)
    return toView(state, viewerId, clock())
  }

  /** Commande d'un joueur : la décision est enregistrée, puis la boîte d'envoi distribuée. */
  async function execute(
    tournamentId: string,
    viewerId: string,
    command: TournamentCommand,
  ): Promise<CommandResult> {
    const decision = await process(tournamentId, command)
    if (!decision.ok) return decision
    const view = await getView(tournamentId, viewerId)
    return view ? { ok: true, view } : { ok: false, error: { code: 'TOURNAMENT_NOT_FOUND' } }
  }

  /** Candidature d'un joueur, avec son profil lu dans le modèle de lecture. */
  async function applicantOf(player: Player, tactic: Tactic) {
    return {
      playerId: player.id,
      name: player.name,
      tactic,
      profile: await reader.profileOf(player.id),
    }
  }

  /** Admission d'un joueur : son profil, ses caractéristiques et les conditions manquantes. */
  async function eligibility(playerId: string): Promise<Eligibility> {
    const profile = (await reader.profileOf(playerId)) ?? EMPTY_PROFILE
    const shortfalls = shortfallsOf(profile)
    return { eligible: shortfalls.length === 0, profile, stats: statsOf(profile), shortfalls }
  }

  /** Ouvre un tournoi, dont le joueur est l'hôte et le premier inscrit. */
  async function open(player: Player, tactic: Tactic) {
    const tournamentId = newId()
    const result = await execute(tournamentId, player.id, {
      type: 'OpenTournament',
      tournamentId,
      applicant: await applicantOf(player, tactic),
    })
    return { tournamentId, result }
  }

  /** Inscrit un joueur à un tournoi ouvert. */
  const join = async (tournamentId: string, player: Player, tactic: Tactic) =>
    execute(tournamentId, player.id, {
      type: 'JoinTournament',
      applicant: await applicantOf(player, tactic),
    })

  /** Lance un tournoi, au nom de son hôte. */
  const start = (tournamentId: string, playerId: string) =>
    execute(tournamentId, playerId, { type: 'StartTournament', playerId, seed: newSeed() })

  /** Tournois les plus récents. */
  const list = () => reader.list()

  /**
   * Étape déclenchée par un message : une erreur métier y est levée, et le message retenté.
   * Le rappel d'un tournoi arrivé un peu avant sa fin est ainsi distribué de nouveau.
   */
  async function step(tournamentId: string, command: TournamentCommand) {
    const decision = await process(tournamentId, command)
    if (!decision.ok) throw new Error(`Tournoi ${tournamentId} : ${decision.error.code}`)
  }

  return { eligibility, open, join, start, getView, list, step }
}

/** Type du service, déduit de sa fabrique. */
export type TournamentService = ReturnType<typeof createTournamentService>
