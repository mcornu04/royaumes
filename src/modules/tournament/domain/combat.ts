/**
 * Combat du Tournoi : caractéristiques d'un combattant, duel et tableau à élimination directe.
 * Tout est déterminé par la graine du tournoi : aucun tirage n'est enregistré, il est refait
 * à l'identique à chaque lecture.
 */
import {
  BEATS,
  DIE_FACES,
  MAX_EXCHANGES,
  ROUNDS,
  type Stats,
  TACTIC_ADVANTAGE,
  TACTIC_MODIFIERS,
  type Tactic,
} from './catalog'
import { createRandom, type Random } from './random'

/** Ce que le Tournoi sait d'un joueur : les niveaux de son village et son armurerie. */
export interface ChampionProfile {
  levels: { sawmill: number; quarry: number; mine: number }
  /** Nombre de pièces récupérées à la Forge. */
  forged: number
  /** Puissance totale de l'armurerie. */
  power: number
}

/**
 * Caractéristiques de combat d'un joueur : l'attaque vient de son armurerie, la défense et les
 * points de vie de son village. L'attaque croît comme la racine carrée de la puissance : chaque
 * pièce compte, sans qu'une armurerie fournie rende le joueur invincible.
 */
export function statsOf(profile: ChampionProfile): Stats {
  const levels = profile.levels.sawmill + profile.levels.quarry + profile.levels.mine
  return {
    attack: 7 + Math.floor(Math.sqrt(profile.power) / 2),
    defense: 3 + Math.floor(levels / 5),
    hp: 48 + levels,
  }
}

/** Combattant engagé dans un duel. */
export interface Fighter {
  stats: Stats
  tactic: Tactic
}

/** Un coup porté : son auteur, les dégâts, et les points de vie restants des deux combattants. */
export interface Exchange {
  attacker: 'a' | 'b'
  damage: number
  hpA: number
  hpB: number
}

/** Déroulement et issue d'un duel. */
export interface Duel {
  exchanges: Exchange[]
  winner: 'a' | 'b'
}

/** Dégâts d'un coup : attaque doublée, dé, défense adverse, avantage tactique. */
export function damageOf(attacker: Fighter, defender: Fighter, roll: number) {
  const attack = attacker.stats.attack + TACTIC_MODIFIERS[attacker.tactic].attack
  const defense = defender.stats.defense + TACTIC_MODIFIERS[defender.tactic].defense
  const advantage = BEATS[attacker.tactic] === defender.tactic ? TACTIC_ADVANTAGE : 0
  return Math.max(2, attack * 2 + roll - defense + advantage)
}

/**
 * Duel entre deux combattants : ils frappent à tour de rôle, a d'abord, jusqu'à ce que l'un
 * tombe. Au-delà du nombre maximal d'échanges, le moins entamé l'emporte, a en cas d'égalité.
 */
export function duel(a: Fighter, b: Fighter, random: Random): Duel {
  let hpA = a.stats.hp
  let hpB = b.stats.hp
  const exchanges: Exchange[] = []
  for (let i = 0; i < MAX_EXCHANGES && hpA > 0 && hpB > 0; i++) {
    const attacker = i % 2 === 0 ? 'a' : 'b'
    const roll = random.between(1, DIE_FACES)
    if (attacker === 'a') {
      const damage = damageOf(a, b, roll)
      hpB = Math.max(0, hpB - damage)
      exchanges.push({ attacker, damage, hpA, hpB })
    } else {
      const damage = damageOf(b, a, roll)
      hpA = Math.max(0, hpA - damage)
      exchanges.push({ attacker, damage, hpA, hpB })
    }
  }
  const winner = hpB <= 0 ? 'a' : hpA <= 0 ? 'b' : hpA / a.stats.hp >= hpB / b.stats.hp ? 'a' : 'b'
  return { exchanges, winner }
}

/** Match du tableau : deux places, le vainqueur et le déroulement du duel. */
export interface Match {
  a: number
  b: number
  winner: number
  exchanges: Exchange[]
}

/**
 * Tableau complet d'un tournoi : les places sont d'abord tirées au sort, puis chaque tour
 * oppose deux à deux les vainqueurs du tour précédent. Renvoie les matchs de chaque tour.
 */
export function bracketOf(fighters: Fighter[], seed: number): Match[][] {
  const random = createRandom(seed)
  let alive = random.shuffle(fighters.map((_, seat) => seat))
  const rounds: Match[][] = []
  for (let round = 0; round < ROUNDS; round++) {
    const matches: Match[] = []
    for (let i = 0; i + 1 < alive.length; i += 2) {
      const a = alive[i] as number
      const b = alive[i + 1] as number
      const result = duel(fighters[a] as Fighter, fighters[b] as Fighter, random)
      matches.push({ a, b, winner: result.winner === 'a' ? a : b, exchanges: result.exchanges })
    }
    rounds.push(matches)
    alive = matches.map((match) => match.winner)
  }
  return rounds
}
