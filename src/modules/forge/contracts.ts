/**
 * Entrée publique « partagée » du module Forge : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des données, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { RECIPES } from './domain/catalog'

export type { Amounts, Rank, Rarity, Recipe, RecipeSpec } from './domain/catalog'
export { CATALOG, RANK_THRESHOLDS, RANKS, RARITIES, RECIPES } from './domain/catalog'
export type { ForgedItem, ForgeError, Setback } from './domain/forge'
export type { ForgeView } from './domain/view'

/** Corps attendu pour commander une pièce : une recette du catalogue. */
export const PlaceOrderInput = z.object({ recipe: z.enum(RECIPES) })

/** Préfixe commun aux noms des flux, et des canaux, de tous les ateliers. */
export const FORGE_STREAM_PREFIX = 'forge-'

/**
 * Nom du flux qui contient les événements de l'atelier d'un joueur. C'est aussi le nom de
 * son canal temps réel : écouter ce canal, c'est recevoir les événements de ce flux.
 */
export const forgeChannel = (playerId: string) => `${FORGE_STREAM_PREFIX}${playerId}`

/** Sujets des messages adressés à la Forge. */
export const FORGE_TOPICS = {
  /** Réponse du Village au prélèvement du coût d'une commande. */
  transferResult: 'forge.transfer-result',
} as const
