/**
 * Contenu de la Forge : recettes, raretés et rangs du forgeron.
 * Ce fichier ne contient que des données. Les règles qui les utilisent
 * se trouvent dans forge.ts : rééquilibrer la Forge ne demande de modifier qu'ici.
 */

/** Quantités de ressources, par nom de ressource (« wood », « stone », « gold »). */
export type Amounts = Partial<Record<string, number>>

/** Raretés des pièces, de la plus commune à la plus précieuse. */
export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

/** Rangs du forgeron, du premier au dernier. */
export const RANKS = ['apprentice', 'journeyman', 'master'] as const
export type Rank = (typeof RANKS)[number]

/** Nombre de pièces forgées à partir duquel chaque rang est atteint. */
export const RANK_THRESHOLDS: Record<Rank, number> = {
  apprentice: 0,
  journeyman: 2,
  master: 5,
}

/** Recettes de la Forge. « as const » permet d'en déduire un type union. */
export const RECIPES = [
  'dagger',
  'longbow',
  'waraxe',
  'stoneshield',
  'runehammer',
  'kingsblade',
] as const
export type Recipe = (typeof RECIPES)[number]

/** Caractéristiques d'une recette. */
export interface RecipeSpec {
  rarity: Rarity
  /** Ressources prélevées dans le village du joueur à la commande. */
  cost: Amounts
  /** Durée de forge, comptée à partir du paiement, en millisecondes. */
  durationMs: number
  /** Rang minimal du forgeron pour commander la pièce. */
  rank: Rank
  /** Puissance de la pièce, ajoutée à celle de l'armurerie. */
  power: number
}

export const CATALOG: Record<Recipe, RecipeSpec> = {
  dagger: {
    rarity: 'common',
    cost: { wood: 30, stone: 10 },
    durationMs: 30_000,
    rank: 'apprentice',
    power: 5,
  },
  longbow: {
    rarity: 'common',
    cost: { wood: 60 },
    durationMs: 45_000,
    rank: 'apprentice',
    power: 8,
  },
  waraxe: {
    rarity: 'rare',
    cost: { wood: 50, stone: 40 },
    durationMs: 60_000,
    rank: 'apprentice',
    power: 14,
  },
  stoneshield: {
    rarity: 'rare',
    cost: { wood: 20, stone: 70 },
    durationMs: 60_000,
    rank: 'journeyman',
    power: 12,
  },
  runehammer: {
    rarity: 'epic',
    cost: { wood: 60, stone: 60, gold: 10 },
    durationMs: 120_000,
    rank: 'journeyman',
    power: 25,
  },
  kingsblade: {
    rarity: 'legendary',
    cost: { wood: 100, stone: 80, gold: 30 },
    durationMs: 180_000,
    rank: 'master',
    power: 50,
  },
}

/** Indique si une chaîne désigne une recette du catalogue. */
export const isRecipe = (value: string): value is Recipe =>
  (RECIPES as readonly string[]).includes(value)
