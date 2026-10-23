/**
 * Contenu des Quêtes du jour : le catalogue des quêtes, leurs récompenses et le coffre.
 * Ce fichier ne contient que des données : rééquilibrer les quêtes ne demande de modifier qu'ici.
 */

/** Durée d'une journée : les quêtes se renouvellent chaque jour à minuit (UTC). */
export const DAY_MS = 24 * 60 * 60_000

/** Activités du joueur que les quêtes comptent, chacune issue d'un module du jeu. */
export const ACTIVITIES = [
  'upgrade',
  'forge',
  'forge_rare',
  'dungeon_end',
  'dungeon_win',
  'tournament_join',
  'tournament_win',
  'offer',
  'message',
] as const
export type Activity = (typeof ACTIVITIES)[number]

/** Nombre de fois que le joueur a pratiqué chaque activité dans la journée. */
export type ActivityCounts = Partial<Record<Activity, number>>

/** Modules du jeu dont les quêtes proviennent. */
export type QuestModule = 'realm' | 'forge' | 'dungeon' | 'tournament' | 'market' | 'tavern'

/** Difficultés : chaque jour compte une quête de chaque difficulté. */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface QuestSpec {
  id: string
  module: QuestModule
  activity: Activity
  /** Nombre de fois que l'activité doit être pratiquée dans la journée. */
  target: number
  difficulty: Difficulty
  /** Récompense, en pièces d'or versées au village du joueur. */
  reward: number
}

export const QUESTS: QuestSpec[] = [
  // Faciles.
  {
    id: 'upgrade-1',
    module: 'realm',
    activity: 'upgrade',
    target: 1,
    difficulty: 'easy',
    reward: 20,
  },
  { id: 'forge-1', module: 'forge', activity: 'forge', target: 1, difficulty: 'easy', reward: 20 },
  { id: 'offer-1', module: 'market', activity: 'offer', target: 1, difficulty: 'easy', reward: 15 },
  {
    id: 'message-1',
    module: 'tavern',
    activity: 'message',
    target: 1,
    difficulty: 'easy',
    reward: 15,
  },
  // Moyennes.
  {
    id: 'upgrade-2',
    module: 'realm',
    activity: 'upgrade',
    target: 2,
    difficulty: 'medium',
    reward: 30,
  },
  {
    id: 'dungeon-end',
    module: 'dungeon',
    activity: 'dungeon_end',
    target: 1,
    difficulty: 'medium',
    reward: 30,
  },
  {
    id: 'tournament-join',
    module: 'tournament',
    activity: 'tournament_join',
    target: 1,
    difficulty: 'medium',
    reward: 30,
  },
  {
    id: 'message-3',
    module: 'tavern',
    activity: 'message',
    target: 3,
    difficulty: 'medium',
    reward: 30,
  },
  // Difficiles.
  {
    id: 'forge-rare',
    module: 'forge',
    activity: 'forge_rare',
    target: 1,
    difficulty: 'hard',
    reward: 60,
  },
  {
    id: 'dungeon-win',
    module: 'dungeon',
    activity: 'dungeon_win',
    target: 1,
    difficulty: 'hard',
    reward: 60,
  },
  {
    id: 'tournament-win',
    module: 'tournament',
    activity: 'tournament_win',
    target: 1,
    difficulty: 'hard',
    reward: 60,
  },
]

/** Récompense du coffre du jour, ouvert une fois les trois récompenses récupérées. */
export const CHEST_REWARD = 50
