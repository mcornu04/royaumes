import { bigint, index, integer, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Tournoi. Les tournois sont dans le journal de la plateforme ;
 * ces tables sont des modèles de lecture, tenus à jour par la projection du Tournoi.
 */
export const tournament = pgSchema('tournament')

/**
 * Profil de combattant de chaque joueur, déduit des événements publiés par le Village
 * (niveaux des bâtiments) et par la Forge (pièces récupérées et leur puissance).
 */
export const champions = tournament.table('champions', {
  playerId: text('player_id').primaryKey(),
  sawmill: integer('sawmill').notNull().default(0),
  quarry: integer('quarry').notNull().default(0),
  mine: integer('mine').notNull().default(0),
  forged: integer('forged').notNull().default(0),
  power: integer('power').notNull().default(0),
})

/** Tournois, pour la liste présentée aux joueurs. */
export const tournaments = tournament.table(
  'tournaments',
  {
    tournamentId: text('tournament_id').primaryKey(),
    hostId: text('host_id').notNull(),
    hostName: text('host_name').notNull(),
    entrants: integer('entrants').notNull(),
    /** open, puis started. */
    status: text('status').notNull(),
    openedAt: bigint('opened_at', { mode: 'number' }).notNull(),
    startedAt: bigint('started_at', { mode: 'number' }),
  },
  (t) => [index('tournaments_opened_at_idx').on(t.openedAt)],
)
