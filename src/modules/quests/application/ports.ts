import type { NewMessage } from '@/platform/outbox/outbox'
import type { ActivityCounts } from '../domain/catalog'
import type { QuestEvent, QuestLogState } from '../domain/quests'

/** Port de persistance des carnets de quêtes, défini par la couche application. */
export interface QuestLogRepository {
  /** Charge les récompenses récupérées par un joueur, et la version de son flux. */
  load(playerId: string): Promise<{ state: QuestLogState; version: number }>
  /** Enregistre de nouveaux événements et les versements qu'ils déclenchent, en une transaction. */
  save(
    playerId: string,
    expectedVersion: number,
    events: QuestEvent[],
    messages: NewMessage[],
  ): Promise<void>
}

/** Port de lecture de l'activité des joueurs, tenue par la projection des Quêtes. */
export interface ActivityReader {
  /** Activité d'un joueur pendant un jour, hors Taverne. */
  activityOf(playerId: string, day: number): Promise<ActivityCounts>
  /** Indique si le joueur a fondé un village. */
  hasVillage(playerId: string): Promise<boolean>
}
