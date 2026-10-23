/**
 * Entrée publique « serveur » du module Quêtes.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createQuestsApi } from './api'
import { createQuestsService } from './application/quests-service'
import { QUESTS_CHANNEL, type TavernActivity } from './contracts'
import {
  createDrizzleActivityReader,
  createEventStoreQuestLogRepository,
} from './infrastructure/adapters'
import { questsProjection } from './infrastructure/quests-projection'
import { createQuestsPersonalData } from './personal-data'

export interface QuestsModuleDeps {
  store: EventStore
  db: Db
  projections: ProjectionRunner
  /** Activité de la Taverne, fournie par son point d'entrée public. */
  tavern: TavernActivity
  /** Distribution de la boîte d'envoi, déclenchée après chaque récompense. */
  dispatch: () => Promise<unknown>
  clock?: () => number
}

/** Fabrique du module : assemble les adaptateurs, le service, l'API et les données personnelles. */
export function createQuestsModule({
  store,
  db,
  projections,
  tavern,
  dispatch,
  clock,
}: QuestsModuleDeps) {
  const repo = createEventStoreQuestLogRepository(store)
  const reader = createDrizzleActivityReader(db, projections)
  const service = createQuestsService(repo, reader, { tavern, dispatch, clock })

  // Canal global et discret, sur le modèle de celui du Classement : il annonce les événements
  // qui font avancer les quêtes, ainsi que les récompenses, et chaque tableau se relit.
  const channelPolicy: ChannelPolicy = {
    prefix: QUESTS_CHANNEL,
    canSubscribe: (channel) => channel === QUESTS_CHANNEL,
    redact: true,
    global: { types: [...questsProjection.eventTypes, 'QuestRewardClaimed', 'DailyChestOpened'] },
  }

  return {
    api: createQuestsApi(service),
    channelPolicy,
    personalData: createQuestsPersonalData(store, db),
  }
}

export type { QuestsApi } from './api'
