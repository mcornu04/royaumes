import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { WorkshopRepository } from '../application/workshop-repository'
import { forgeChannel } from '../contracts'
import { type ForgeEvent, replay } from '../domain/forge'

/** Adaptateur du port WorkshopRepository fondé sur le journal d'événements. */
export function createEventStoreWorkshopRepository(store: EventStore): WorkshopRepository {
  return {
    async load(playerId) {
      const stored = await store.read(forgeChannel(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as ForgeEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(playerId, expectedVersion, events, messages) {
      // Les événements de l'atelier et les messages de la saga : une seule transaction.
      await store.append(
        forgeChannel(playerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
