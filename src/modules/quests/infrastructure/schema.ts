import { integer, pgSchema, primaryKey, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Quêtes. Les récompenses récupérées sont dans le journal de la
 * plateforme ; ces tables sont des modèles de lecture, tenus à jour par la projection des Quêtes.
 */
export const quests = pgSchema('quests')

/**
 * Activité de chaque joueur, jour par jour : combien de fois il a pratiqué chaque activité
 * comptée par les quêtes, d'après les événements publiés par les autres modules.
 */
export const activity = quests.table(
  'activity',
  {
    playerId: text('player_id').notNull(),
    /** Numéro du jour (UTC) : jours écoulés depuis le 1er janvier 1970. */
    day: integer('day').notNull(),
    activity: text('activity').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.day, t.activity] })],
)

/** Joueurs qui ont fondé un village, et peuvent donc recevoir l'or des récompenses. */
export const villagers = quests.table('villagers', {
  playerId: text('player_id').primaryKey(),
})
