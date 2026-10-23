/** Vue de l'atelier d'un joueur, calculée à un instant donné. */
import {
  type Amounts,
  CATALOG,
  RANK_THRESHOLDS,
  RANKS,
  type Rank,
  type Rarity,
  RECIPES,
  type Recipe,
} from './catalog'
import { type ForgedItem, type ForgeState, rankOf, reaches, type Setback } from './forge'

export interface ForgeView {
  rank: Rank
  /** Prochain rang, et nombre de pièces encore à forger pour l'atteindre ; null au dernier rang. */
  nextRank: { rank: Rank; remaining: number } | null
  /** Puissance totale de l'armurerie. */
  power: number
  /**
   * Commande en cours. « ready » est calculé à la lecture : la pièce est prête dès que son
   * échéance est passée, sans qu'aucun événement ne l'ait enregistré (échéance paresseuse).
   */
  current: {
    number: number
    recipe: Recipe
    status: 'paying' | 'forging' | 'ready'
    readyAt: number | null
    durationMs: number
    cost: Amounts
  } | null
  setback: Setback | null
  /** Pièces de l'armurerie, de la plus récente à la plus ancienne. */
  armory: ForgedItem[]
  /** Catalogue, avec pour chaque recette le droit de la commander au rang actuel. */
  recipes: {
    recipe: Recipe
    rarity: Rarity
    cost: Amounts
    durationMs: number
    rank: Rank
    power: number
    unlocked: boolean
  }[]
  asOf: number
}

export function toView(state: ForgeState, now: number): ForgeView {
  const forged = state.armory.length
  const rank = rankOf(forged)
  const next = RANKS[RANKS.indexOf(rank) + 1]
  const current = state.current
  return {
    rank,
    nextRank: next ? { rank: next, remaining: RANK_THRESHOLDS[next] - forged } : null,
    power: state.armory.reduce((sum, item) => sum + CATALOG[item.recipe].power, 0),
    current: current
      ? {
          number: current.number,
          recipe: current.recipe,
          status:
            current.status === 'forging' && current.readyAt !== null && now >= current.readyAt
              ? 'ready'
              : current.status,
          readyAt: current.readyAt,
          durationMs: current.durationMs,
          cost: current.cost,
        }
      : null,
    setback: state.setback,
    armory: [...state.armory].reverse(),
    recipes: RECIPES.map((recipe) => ({
      recipe,
      ...CATALOG[recipe],
      unlocked: reaches(rank, CATALOG[recipe].rank),
    })),
    asOf: now,
  }
}
