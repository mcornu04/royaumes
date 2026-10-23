import { eq, sql } from 'drizzle-orm'
import { CATALOG, FORGE_STREAM_PREFIX, type Recipe } from '@/modules/forge/contracts'
import { STARTING_LEVELS, VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import { TOURNAMENT_STREAM_PREFIX } from '../contracts'
import type { TournamentEvent } from '../domain/tournament'
import { champions, tournaments } from './schema'

/*
 * Données des événements lus dans le langage publié du Village et de la Forge.
 * Seuls les champs utiles sont décrits : le Tournoi en dépend, comme tout lecteur du journal.
 */
interface BuildingUpgradedData {
  building: 'sawmill' | 'quarry' | 'mine'
  toLevel: number
}
interface ItemCollectedData {
  recipe: Recipe
}

/** Identifiant tiré du nom d'un flux : « village-7f3a » donne « 7f3a ». */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/** Colonne de la table des combattants pour chaque bâtiment. */
const LEVEL_COLUMNS = {
  sawmill: champions.sawmill,
  quarry: champions.quarry,
  mine: champions.mine,
} as const

/** Crée la ligne d'un joueur si elle n'existe pas encore. */
const ensureChampion = (tx: DbTransaction, playerId: string) =>
  tx.insert(champions).values({ playerId }).onConflictDoNothing()

/**
 * Projection du Tournoi : profil de combattant de chaque joueur, à partir des événements du
 * Village et de la Forge, et liste des tournois, à partir des événements du Tournoi.
 */
export const tournamentProjection: Projection = {
  name: 'tournament',
  version: 1,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'ItemCollected',
    'TournamentOpened',
    'EntrantJoined',
    'TournamentStarted',
  ],

  async apply(event, tx) {
    // Profil de combattant : niveaux des bâtiments à la fondation du village.
    if (event.type === 'VillageFounded' && event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) {
      const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
      await ensureChampion(tx, playerId)
      await tx
        .update(champions)
        .set({
          sawmill: sql`greatest(${champions.sawmill}, ${STARTING_LEVELS.sawmill})`,
          quarry: sql`greatest(${champions.quarry}, ${STARTING_LEVELS.quarry})`,
          mine: sql`greatest(${champions.mine}, ${STARTING_LEVELS.mine})`,
        })
        .where(eq(champions.playerId, playerId))
      return
    }

    // Profil de combattant : niveaux des bâtiments du village, à chaque amélioration.
    if (event.type === 'BuildingUpgraded' && event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) {
      const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
      const { building, toLevel } = event.data as unknown as BuildingUpgradedData
      const column = LEVEL_COLUMNS[building]
      if (!column) return
      await ensureChampion(tx, playerId)
      await tx
        .update(champions)
        .set({ [building]: sql`greatest(${column}, ${toLevel})` })
        .where(eq(champions.playerId, playerId))
      return
    }

    // Profil de combattant : pièces récupérées à la Forge, et puissance de l'armurerie.
    if (event.type === 'ItemCollected' && event.stream.startsWith(FORGE_STREAM_PREFIX)) {
      const playerId = idFrom(event, FORGE_STREAM_PREFIX)
      const { recipe } = event.data as unknown as ItemCollectedData
      await ensureChampion(tx, playerId)
      await tx
        .update(champions)
        .set({
          forged: sql`${champions.forged} + 1`,
          power: sql`${champions.power} + ${CATALOG[recipe]?.power ?? 0}`,
        })
        .where(eq(champions.playerId, playerId))
      return
    }

    // Liste des tournois.
    if (!event.stream.startsWith(TOURNAMENT_STREAM_PREFIX)) return
    const tournamentId = idFrom(event, TOURNAMENT_STREAM_PREFIX)
    const data = { type: event.type, data: event.data } as TournamentEvent
    switch (data.type) {
      case 'TournamentOpened':
        await tx
          .insert(tournaments)
          .values({
            tournamentId,
            hostId: data.data.hostId,
            hostName: data.data.hostName,
            entrants: 1,
            status: 'open',
            openedAt: data.data.at,
          })
          .onConflictDoNothing()
        return
      case 'EntrantJoined':
        await tx
          .update(tournaments)
          .set({ entrants: sql`${tournaments.entrants} + 1` })
          .where(eq(tournaments.tournamentId, tournamentId))
        return
      case 'TournamentStarted':
        await tx
          .update(tournaments)
          .set({ status: 'started', startedAt: data.data.at })
          .where(eq(tournaments.tournamentId, tournamentId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(champions)
    await tx.delete(tournaments)
  },
}
