/**
 * Tableau des quêtes du jour : le tirage des trois quêtes d'un joueur, et leur avancement.
 * Le tirage ne dépend que du jour et du joueur : il est identique à chaque lecture, sans être
 * enregistré, et différent d'un jour à l'autre.
 */
import { type ActivityCounts, DAY_MS, QUESTS, type QuestSpec } from './catalog'

/** Numéro du jour d'un instant : le nombre de jours écoulés depuis le 1er janvier 1970 (UTC). */
export const dayOf = (instant: number) => Math.floor(instant / DAY_MS)

/** Premier instant d'un jour. */
export const startOfDay = (day: number) => day * DAY_MS

/** Empreinte numérique d'une chaîne (FNV-1a), qui sert de graine au tirage. */
function hash(text: string) {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/** Générateur pseudo-aléatoire initialisé par une graine (mulberry32). */
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Les trois quêtes d'un joueur pour un jour : une difficile, une moyenne et une facile, toutes
 * de modules différents. La difficile est tirée d'abord, puisque son choix est le plus restreint.
 */
export function dailyQuests(playerId: string, day: number): QuestSpec[] {
  const random = createRandom(hash(`${day}:${playerId}`))
  const used = new Set<string>()
  const picks: QuestSpec[] = []
  for (const difficulty of ['hard', 'medium', 'easy'] as const) {
    const pool = QUESTS.filter((q) => q.difficulty === difficulty && !used.has(q.module))
    const quest = pool[Math.floor(random() * pool.length)] as QuestSpec
    used.add(quest.module)
    picks.push(quest)
  }
  // Présentées de la plus facile à la plus difficile.
  return picks.reverse()
}

/** Avancement d'une quête : le nombre d'activités comptées, plafonné à l'objectif. */
export const progressOf = (quest: QuestSpec, activity: ActivityCounts) =>
  Math.min(quest.target, activity[quest.activity] ?? 0)

/** Une quête est accomplie dès que son objectif est atteint. */
export const isDone = (quest: QuestSpec, activity: ActivityCounts) =>
  progressOf(quest, activity) >= quest.target
