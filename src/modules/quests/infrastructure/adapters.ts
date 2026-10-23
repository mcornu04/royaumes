import { and, eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ActivityReader, QuestLogRepository } from '../application/ports'
import { questStream } from '../contracts'
import type { Activity, ActivityCounts } from '../domain/catalog'
import { type QuestEvent, replay } from '../domain/quests'
import { questsProjection } from './quests-projection'
import { activity, villagers } from './schema'

/** Adaptateur du port QuestLogRepository fondé sur le journal d'événements. */
export function createEventStoreQuestLogRepository(store: EventStore): QuestLogRepository {
  return {
    async load(playerId) {
      const stored = await store.read(questStream(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as QuestEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(playerId, expectedVersion, events, messages) {
      await store.append(
        questStream(playerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}

/** Adaptateur du port ActivityReader, fondé sur les tables tenues par la projection. */
export function createDrizzleActivityReader(db: Db, projections: ProjectionRunner): ActivityReader {
  return {
    async activityOf(playerId, day) {
      await projections.catchUp(questsProjection)
      const rows = await db
        .select()
        .from(activity)
        .where(and(eq(activity.playerId, playerId), eq(activity.day, day)))
      const counts: ActivityCounts = {}
      for (const row of rows) counts[row.activity as Activity] = row.count
      return counts
    },

    async hasVillage(playerId) {
      await projections.catchUp(questsProjection)
      const [row] = await db.select().from(villagers).where(eq(villagers.playerId, playerId))
      return row !== undefined
    },
  }
}
