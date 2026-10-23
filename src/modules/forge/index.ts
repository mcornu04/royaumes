/**
 * Entrée publique « serveur » du module Forge.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createForgeApi } from './api'
import { createForgeService } from './application/forge-service'
import { FORGE_STREAM_PREFIX, forgeChannel } from './contracts'
import { createEventStoreWorkshopRepository } from './infrastructure/event-store-workshop-repository'
import { createForgeHandlers } from './messages'
import { createForgePersonalData } from './personal-data'

export interface ForgeModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Distribution de la boîte d'envoi, déclenchée par la Forge après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble l'adaptateur, le service, l'API, la règle du canal,
 * les gestionnaires de messages et les données personnelles.
 */
export function createForgeModule({ store, dispatch, clock }: ForgeModuleDeps) {
  const repo = createEventStoreWorkshopRepository(store)
  const service = createForgeService(repo, { dispatch, clock })

  // Règle d'accès au canal temps réel : un joueur n'écoute que son propre atelier.
  const channelPolicy: ChannelPolicy = {
    prefix: FORGE_STREAM_PREFIX,
    canSubscribe: (channel, userId) => channel === forgeChannel(userId),
  }

  return {
    api: createForgeApi(service),
    channelPolicy,
    handlers: createForgeHandlers(service),
    personalData: createForgePersonalData(store),
  }
}

export type { ForgeApi } from './api'
