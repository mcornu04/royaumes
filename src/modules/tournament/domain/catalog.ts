/**
 * Contenu du Tournoi : conditions d'entrée, tactiques, chevaliers pilotés par l'ordinateur
 * et valeurs d'équilibrage. Ce fichier ne contient que des données : rééquilibrer le Tournoi
 * ne demande de modifier qu'ici.
 */

/** Nombre de places d'un tournoi : quarts de finale, demi-finales et finale. */
export const SEATS = 8

/** Durée d'un tour, en millisecondes : chaque tour se dévoile à son échéance. */
export const ROUND_MS = 30_000

/** Nombre de tours d'un tournoi de huit places. */
export const ROUNDS = 3

/**
 * Conditions d'entrée : chaque bâtiment du village au moins à ce niveau, et au moins ce nombre
 * de pièces forgées, soit le rang de compagnon de la Forge. La correspondance avec le rang de la
 * Forge est vérifiée par un test de l'application, le domaine n'important aucun autre module.
 */
export const ENTRY_REQUIREMENTS = { buildingLevel: 5, forgedPieces: 2 } as const

/** Tactiques d'un combattant, choisies à l'inscription. */
export const TACTICS = ['offensive', 'balanced', 'defensive'] as const
export type Tactic = (typeof TACTICS)[number]

/** Modificateurs d'attaque et de défense de chaque tactique. */
export const TACTIC_MODIFIERS: Record<Tactic, { attack: number; defense: number }> = {
  offensive: { attack: 1, defense: -2 },
  balanced: { attack: 0, defense: 0 },
  defensive: { attack: -1, defense: 3 },
}

/**
 * Triangle des tactiques : chacune l'emporte sur une autre. L'offensive déborde l'équilibrée,
 * l'équilibrée use la défensive, la défensive pare l'offensive.
 */
export const BEATS: Record<Tactic, Tactic> = {
  offensive: 'balanced',
  balanced: 'defensive',
  defensive: 'offensive',
}

/** Dégâts supplémentaires de la tactique qui l'emporte sur celle de l'adversaire. */
export const TACTIC_ADVANTAGE = 4

/** Nombre de faces du dé lancé à chaque coup : il donne sa part d'incertitude au combat. */
export const DIE_FACES = 12

/** Nombre maximal d'échanges d'un duel ; au-delà, le combattant le moins entamé l'emporte. */
export const MAX_EXCHANGES = 40

/** Caractéristiques de combat. */
export interface Stats {
  attack: number
  defense: number
  hp: number
}

/**
 * Chevaliers pilotés par l'ordinateur, qui occupent les places laissées vides. Leurs
 * caractéristiques ont été réglées par simulation : un joueur tout juste admis remporte environ
 * un tournoi sur dix, un joueur au village et à l'armurerie avancés la plupart.
 */
export const BOTS: { name: string; tactic: Tactic; stats: Stats }[] = [
  { name: 'Sire Gauvain de Fer', tactic: 'offensive', stats: { attack: 7, defense: 6, hp: 64 } },
  { name: 'La Dame du Lac Noir', tactic: 'defensive', stats: { attack: 6, defense: 8, hp: 60 } },
  { name: 'Le Baron Cendré', tactic: 'offensive', stats: { attack: 8, defense: 5, hp: 58 } },
  { name: 'Frère Anselme', tactic: 'defensive', stats: { attack: 5, defense: 9, hp: 70 } },
  { name: "La Louve d'Argent", tactic: 'balanced', stats: { attack: 7, defense: 7, hp: 62 } },
  { name: 'Messire Tristan', tactic: 'balanced', stats: { attack: 6, defense: 7, hp: 66 } },
  { name: 'Le Chevalier sans Nom', tactic: 'balanced', stats: { attack: 9, defense: 7, hp: 68 } },
]

/** Récompenses versées au village des joueurs, à la fin du tournoi. */
export const PRIZES = { champion: { gold: 50 }, finalist: { gold: 20 } } as const
