/**
 * Entrée publique « partagée » du module Tournoi : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des données, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { type Stats, TACTICS } from './domain/catalog'
import type { ChampionProfile } from './domain/combat'
import type { Shortfall } from './domain/tournament'

export type { Stats, Tactic } from './domain/catalog'
export { ENTRY_REQUIREMENTS, PRIZES, ROUND_MS, ROUNDS, SEATS, TACTICS } from './domain/catalog'
export type { ChampionProfile, Exchange } from './domain/combat'
export type { Shortfall, TournamentError } from './domain/tournament'
export type { MatchView, TournamentView } from './domain/view'

/** Corps attendu pour ouvrir ou rejoindre un tournoi : la tactique du combattant. */
export const EnterTournamentInput = z.object({ tactic: z.enum(TACTICS) })

/** Préfixe commun aux noms des flux de tous les tournois. */
export const TOURNAMENT_STREAM_PREFIX = 'tournament-'

/** Nom du flux qui contient les événements d'un tournoi. */
export const tournamentStream = (tournamentId: string) =>
  `${TOURNAMENT_STREAM_PREFIX}${tournamentId}`

/** Nom du canal temps réel global du Tournoi, qui annonce l'évolution des tournois. */
export const TOURNAMENT_CHANNEL = 'tournaments'

/** Sujets des messages adressés au Tournoi. */
export const TOURNAMENT_TOPICS = {
  /** Rappel différé d'un tournoi, à sa fin, pour verser les récompenses. */
  award: 'tournament.award',
} as const

/** Tournoi tel que le présente la liste des tournois. */
export interface TournamentSummary {
  tournamentId: string
  hostName: string
  entrants: number
  status: 'open' | 'started'
  openedAt: number
  startedAt: number | null
}

/** Liste des tournois, avec la position du journal jusqu'à laquelle elle est à jour. */
export interface TournamentList {
  position: number
  tournaments: TournamentSummary[]
}

/** Admission d'un joueur : son profil, ses caractéristiques et les conditions manquantes. */
export interface Eligibility {
  eligible: boolean
  profile: ChampionProfile
  stats: Stats
  shortfalls: Shortfall[]
}
