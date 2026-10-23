/**
 * Entrée publique « partagée » du module Quêtes : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types et des données.
 */
export type {
  Activity,
  ActivityCounts,
  Difficulty,
  QuestModule,
  QuestSpec,
} from './domain/catalog'
export { CHEST_REWARD, DAY_MS, QUESTS } from './domain/catalog'
export type { QuestError } from './domain/quests'
export type { QuestBoardView } from './domain/view'

/**
 * Nom du canal temps réel global des Quêtes : il annonce, sans leurs données, les événements
 * qui peuvent faire avancer une quête ; chaque joueur relit alors son propre tableau.
 */
export const QUESTS_CHANNEL = 'quests'

/** Préfixe commun aux noms des flux de tous les carnets de quêtes. */
export const QUEST_STREAM_PREFIX = 'quests-'

/** Nom du flux qui contient les récompenses récupérées par un joueur. */
export const questStream = (playerId: string) => `${QUEST_STREAM_PREFIX}${playerId}`

/**
 * Lecture de l'activité de la Taverne, fournie par la racine de composition : la Taverne
 * n'enregistre pas d'événements (ADR 0008), son activité ne peut donc pas être projetée.
 */
export interface TavernActivity {
  /** Nombre de messages publiés par un joueur depuis un instant. */
  messagesSince(playerId: string, since: number): Promise<number>
}
