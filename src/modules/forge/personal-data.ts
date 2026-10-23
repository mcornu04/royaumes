import type { EventStore } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { forgeChannel } from './contracts'

/** Événements de l'atelier dont les données contiennent le nom du forgeron (son poinçon). */
const SIGNED_EVENTS = ['OrderPlaced', 'ItemCollected']

/**
 * Données personnelles de la Forge : le nom du joueur, gravé sur chaque pièce commandée
 * et récupérée. La Forge ne tient aucune table : tout est dans le flux de l'atelier.
 */
export function createForgePersonalData(store: EventStore): PersonalDataContributor {
  return {
    name: 'forge',

    async export(playerId) {
      const stored = await store.read(forgeChannel(playerId))
      return {
        orders: stored
          .filter((e) => e.type === 'OrderPlaced')
          .map((e) => ({
            number: e.data.number,
            recipe: e.data.recipe,
            smithName: e.data.smithName,
            cost: e.data.cost,
            at: e.data.at,
          })),
        armory: stored
          .filter((e) => e.type === 'ItemCollected')
          .map((e) => ({ number: e.data.number, recipe: e.data.recipe, forgedAt: e.data.at })),
      }
    },

    // Seuls les événements de l'atelier du joueur portent son nom.
    redact(event, playerId) {
      if (event.stream !== forgeChannel(playerId) || !SIGNED_EVENTS.includes(event.type))
        return null
      if (event.data.smithName === ERASED_NAME) return null
      return { ...event.data, smithName: ERASED_NAME }
    },
  }
}
