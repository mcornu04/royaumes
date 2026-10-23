import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { TOURNAMENT_STREAM_PREFIX } from './contracts'
import { champions, tournaments } from './infrastructure/schema'

/**
 * Données personnelles du Tournoi : le nom du joueur, copié dans les tournois qu'il a ouverts
 * ou rejoints, et son profil de combattant, déduit de son village et de sa forge.
 */
export function createTournamentPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'tournament',

    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: TOURNAMENT_STREAM_PREFIX,
        types: ['TournamentOpened', 'EntrantJoined'],
      })
      const [profile] = await db.select().from(champions).where(eq(champions.playerId, playerId))
      return {
        profile: profile ?? null,
        entries: stored
          .filter(
            (e) =>
              (e.type === 'TournamentOpened' && e.data.hostId === playerId) ||
              (e.type === 'EntrantJoined' && e.data.playerId === playerId),
          )
          .map((e) => ({
            tournamentId: e.stream.slice(TOURNAMENT_STREAM_PREFIX.length),
            role: e.type === 'TournamentOpened' ? 'host' : 'entrant',
            tactic: e.data.tactic,
            at: e.data.at,
          })),
      }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(TOURNAMENT_STREAM_PREFIX)) return null
      if (event.type === 'TournamentOpened' && event.data.hostId === playerId) {
        return event.data.hostName === ERASED_NAME ? null : { ...event.data, hostName: ERASED_NAME }
      }
      if (event.type === 'EntrantJoined' && event.data.playerId === playerId) {
        return event.data.name === ERASED_NAME ? null : { ...event.data, name: ERASED_NAME }
      }
      return null
    },

    // Le profil de combattant est supprimé ; le nom de l'hôte est retiré de la liste des tournois.
    async erase(playerId) {
      await db.delete(champions).where(eq(champions.playerId, playerId))
      await db
        .update(tournaments)
        .set({ hostName: ERASED_NAME })
        .where(eq(tournaments.hostId, playerId))
    },
  }
}
