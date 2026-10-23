import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { questStream } from './contracts'
import { activity, villagers } from './infrastructure/schema'

/**
 * Données personnelles des Quêtes : l'activité quotidienne du joueur, déduite des autres
 * modules, et les récompenses qu'il a récupérées. Aucun nom n'est copié dans les événements.
 */
export function createQuestsPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'quests',

    async export(playerId) {
      const [rows, claims] = await Promise.all([
        db.select().from(activity).where(eq(activity.playerId, playerId)),
        store.read(questStream(playerId)),
      ])
      return {
        activity: rows.map(({ day, activity: kind, count }) => ({ day, activity: kind, count })),
        rewards: claims.map((e) => ({ type: e.type, ...e.data })),
      }
    },

    // L'activité est une donnée de comportement du joueur : elle est supprimée.
    async erase(playerId) {
      await db.delete(activity).where(eq(activity.playerId, playerId))
      await db.delete(villagers).where(eq(villagers.playerId, playerId))
    },
  }
}
