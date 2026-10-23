import { sql } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { CATALOG, FORGE_STREAM_PREFIX, type Recipe } from '@/modules/forge/contracts'
import { OFFER_STREAM_PREFIX } from '@/modules/market/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import { TOURNAMENT_STREAM_PREFIX } from '@/modules/tournament/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import { dayOf } from '../domain/board'
import type { Activity } from '../domain/catalog'
import { activity, villagers } from './schema'

/*
 * Données des événements lus dans le langage publié des autres modules. Seuls les champs utiles
 * sont décrits : les Quêtes en dépendent, comme tout lecteur du journal. Chacun porte l'instant
 * de l'action (at), qui désigne le jour où elle compte.
 */
interface ItemCollectedData {
  recipe: Recipe
  at: number
}
interface GameEndedData {
  result: 'won' | 'lost'
  heroIds: string[]
  at: number
}
interface TournamentOpenedData {
  hostId: string
  at: number
}
interface EntrantJoinedData {
  playerId: string
  at: number
}
interface PrizesAwardedData {
  championId: string | null
  at: number
}
interface OfferPublishedData {
  sellerId: string
  at: number
}

/** Identifiant tiré du nom d'un flux : « village-7f3a » donne « 7f3a ». */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/** Compte une activité d'un joueur, le jour où elle a eu lieu. */
async function count(tx: DbTransaction, playerId: string, at: number, kind: Activity) {
  await tx
    .insert(activity)
    .values({ playerId, day: dayOf(at), activity: kind, count: 1 })
    .onConflictDoUpdate({
      target: [activity.playerId, activity.day, activity.activity],
      set: { count: sql`${activity.count} + 1` },
    })
}

/**
 * Projection des Quêtes : l'activité de chaque joueur, jour par jour, à partir des événements
 * du Village, de la Forge, du Donjon, du Tournoi et du Marché.
 */
export const questsProjection: Projection = {
  name: 'quests',
  version: 1,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'ItemCollected',
    'GameEnded',
    'TournamentOpened',
    'EntrantJoined',
    'PrizesAwarded',
    'OfferPublished',
  ],

  async apply(event, tx) {
    const at = Number((event.data as { at?: number }).at ?? event.occurredAt.getTime())
    const from = (prefix: string) => event.stream.startsWith(prefix)

    switch (event.type) {
      case 'VillageFounded':
        if (!from(VILLAGE_CHANNEL_PREFIX)) return
        await tx
          .insert(villagers)
          .values({ playerId: idFrom(event, VILLAGE_CHANNEL_PREFIX) })
          .onConflictDoNothing()
        return

      case 'BuildingUpgraded':
        if (from(VILLAGE_CHANNEL_PREFIX)) {
          await count(tx, idFrom(event, VILLAGE_CHANNEL_PREFIX), at, 'upgrade')
        }
        return

      case 'ItemCollected': {
        if (!from(FORGE_STREAM_PREFIX)) return
        const playerId = idFrom(event, FORGE_STREAM_PREFIX)
        await count(tx, playerId, at, 'forge')
        // Une pièce rare, épique ou légendaire compte aussi pour la quête difficile de la Forge.
        const { recipe } = event.data as unknown as ItemCollectedData
        if (CATALOG[recipe] && CATALOG[recipe].rarity !== 'common') {
          await count(tx, playerId, at, 'forge_rare')
        }
        return
      }

      case 'GameEnded': {
        if (!from(GAME_CHANNEL_PREFIX)) return
        // Les héros de l'expédition ; les compagnons, sans compte de joueur, n'ont pas de quêtes.
        const { result, heroIds } = event.data as unknown as GameEndedData
        for (const heroId of heroIds) {
          await count(tx, heroId, at, 'dungeon_end')
          if (result === 'won') await count(tx, heroId, at, 'dungeon_win')
        }
        return
      }

      case 'TournamentOpened':
        if (from(TOURNAMENT_STREAM_PREFIX)) {
          const { hostId } = event.data as unknown as TournamentOpenedData
          await count(tx, hostId, at, 'tournament_join')
        }
        return

      case 'EntrantJoined':
        if (from(TOURNAMENT_STREAM_PREFIX)) {
          const { playerId } = event.data as unknown as EntrantJoinedData
          await count(tx, playerId, at, 'tournament_join')
        }
        return

      case 'PrizesAwarded': {
        if (!from(TOURNAMENT_STREAM_PREFIX)) return
        const { championId } = event.data as unknown as PrizesAwardedData
        if (championId) await count(tx, championId, at, 'tournament_win')
        return
      }

      case 'OfferPublished':
        if (from(OFFER_STREAM_PREFIX)) {
          const { sellerId } = event.data as unknown as OfferPublishedData
          await count(tx, sellerId, at, 'offer')
        }
        return
    }
  },

  async reset(tx) {
    await tx.delete(activity)
    await tx.delete(villagers)
  },
}
