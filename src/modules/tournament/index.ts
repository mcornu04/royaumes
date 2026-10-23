/**
 * Entrée publique « serveur » du module Tournoi.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createTournamentApi } from './api'
import { createTournamentService } from './application/tournament-service'
import { TOURNAMENT_CHANNEL } from './contracts'
import {
  createDrizzleTournamentReader,
  createEventStoreTournamentRepository,
} from './infrastructure/adapters'
import { createTournamentHandlers } from './messages'
import { createTournamentPersonalData } from './personal-data'

export interface TournamentModuleDeps {
  store: EventStore
  db: Db
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée après les commandes et les consultations. */
  dispatch: () => Promise<unknown>
  clock?: () => number
}

/**
 * Fabrique du module : assemble les adaptateurs, le service, l'API, la règle du canal,
 * les gestionnaires de messages et les données personnelles.
 */
export function createTournamentModule({
  store,
  db,
  projections,
  dispatch,
  clock,
}: TournamentModuleDeps) {
  const repo = createEventStoreTournamentRepository(store)
  const reader = createDrizzleTournamentReader(db, projections)
  const service = createTournamentService(repo, reader, { dispatch, clock })

  // Canal global et discret, sur le modèle de celui du Marché : il annonce l'évolution des
  // tournois, sans leurs données, et chaque joueur relit sa vue. Les tournois sont publics.
  const channelPolicy: ChannelPolicy = {
    prefix: TOURNAMENT_CHANNEL,
    canSubscribe: (channel) => channel === TOURNAMENT_CHANNEL,
    redact: true,
    global: { types: ['TournamentOpened', 'EntrantJoined', 'TournamentStarted', 'PrizesAwarded'] },
  }

  return {
    api: createTournamentApi(service),
    channelPolicy,
    handlers: createTournamentHandlers(service),
    // Tâche quotidienne : retrait des tournois terminés du modèle de lecture.
    dailyTask: service.purge,
    personalData: createTournamentPersonalData(store, db),
  }
}

export type { TournamentApi } from './api'
