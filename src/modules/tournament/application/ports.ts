import type { NewMessage } from '@/platform/outbox/outbox'
import type { TournamentList } from '../contracts'
import type { ChampionProfile } from '../domain/combat'
import type { TournamentEvent, TournamentState } from '../domain/tournament'

/** Port de persistance des tournois, défini par la couche application. */
export interface TournamentRepository {
  /** Charge l'état d'un tournoi, reconstruit à partir de ses événements, et sa version. */
  load(tournamentId: string): Promise<{ state: TournamentState; version: number }>
  /**
   * Enregistre de nouveaux événements, et les messages qu'ils déclenchent, dans une même
   * transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    tournamentId: string,
    expectedVersion: number,
    events: TournamentEvent[],
    messages: NewMessage[],
  ): Promise<void>
}

/** Port de lecture des modèles du Tournoi, tenus par sa projection. */
export interface TournamentReader {
  /** Profil de combattant d'un joueur ; null s'il n'a ni bâtiment amélioré ni pièce forgée. */
  profileOf(playerId: string): Promise<ChampionProfile | null>
  /** Tournois les plus récents. */
  list(): Promise<TournamentList>
}
