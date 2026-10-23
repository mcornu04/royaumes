import { and, desc, eq, gt, lt, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { TournamentReader, TournamentRepository } from '../application/ports'
import { ROUND_MS, ROUNDS, type TournamentSummary, tournamentStream } from '../contracts'
import { replay, type TournamentEvent } from '../domain/tournament'
import { champions, tournaments } from './schema'
import { tournamentProjection } from './tournament-projection'

/** Nombre maximal de tournois présentés. */
const LIST_SIZE = 20

/** Adaptateur du port TournamentRepository fondé sur le journal d'événements. */
export function createEventStoreTournamentRepository(store: EventStore): TournamentRepository {
  return {
    async load(tournamentId) {
      const stored = await store.read(tournamentStream(tournamentId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as TournamentEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(tournamentId, expectedVersion, events, messages) {
      await store.append(
        tournamentStream(tournamentId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}

/** Adaptateur du port TournamentReader, fondé sur les tables tenues par la projection. */
export function createDrizzleTournamentReader(
  db: Db,
  projections: ProjectionRunner,
): TournamentReader {
  return {
    async profileOf(playerId) {
      await projections.catchUp(tournamentProjection)
      const [row] = await db.select().from(champions).where(eq(champions.playerId, playerId))
      if (!row) return null
      return {
        levels: { sawmill: row.sawmill, quarry: row.quarry, mine: row.mine },
        forged: row.forged,
        power: row.power,
      }
    },

    async list(now) {
      await projections.catchUp(tournamentProjection)
      // Comme au TD8 : la position est lue avant la table, qui reflète au moins cette position.
      const position = await projections.positionOf(tournamentProjection.name)
      // Seuls les tournois ouverts, et ceux dont le dernier tour n'est pas encore terminé, sont
      // présentés : un tournoi terminé sort de la liste dès sa finale.
      const rows = await db
        .select()
        .from(tournaments)
        .where(
          or(
            eq(tournaments.status, 'open'),
            and(
              eq(tournaments.status, 'started'),
              gt(tournaments.startedAt, now - ROUNDS * ROUND_MS),
            ),
          ),
        )
        .orderBy(desc(tournaments.openedAt))
        .limit(LIST_SIZE)
      return {
        position,
        tournaments: rows.map(
          (row): TournamentSummary => ({
            tournamentId: row.tournamentId,
            hostName: row.hostName,
            entrants: row.entrants,
            status: row.status as TournamentSummary['status'],
            openedAt: row.openedAt,
            startedAt: row.startedAt,
          }),
        ),
      }
    },

    async purgeStartedBefore(instant) {
      // Une reconstruction de la projection rétablirait ces lignes à partir du journal ; la
      // tâche quotidienne suivante les retirerait de nouveau.
      const removed = await db
        .delete(tournaments)
        .where(and(eq(tournaments.status, 'started'), lt(tournaments.startedAt, instant)))
        .returning({ tournamentId: tournaments.tournamentId })
      return removed.length
    },
  }
}
