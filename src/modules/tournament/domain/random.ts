/**
 * Générateur pseudo-aléatoire initialisé par une graine (mulberry32). Une même graine produit
 * toujours la même suite de tirages : un tournoi est ainsi rejouable à l'identique, et testable.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0
  /** Nombre réel dans [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** Entier compris entre min et max, bornes incluses. */
  const between = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  /** Copie mélangée d'une liste (mélange de Fisher-Yates). */
  function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = between(0, i)
      ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
    }
    return copy
  }
  return { next, between, shuffle }
}

export type Random = ReturnType<typeof createRandom>
