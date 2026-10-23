'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TAVERN_CHANNEL } from '@/modules/tavern/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { QuestsApi } from './api'
import { QUESTS_CHANNEL, type QuestBoardView, type QuestError, type QuestModule } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<QuestsApi>('/api/quests')

/** Intitulé de chaque quête. */
const QUEST_LABELS: Record<string, string> = {
  'upgrade-1': 'Améliorer un bâtiment du village',
  'upgrade-2': 'Améliorer deux bâtiments du village',
  'forge-1': 'Forger une pièce',
  'forge-rare': 'Forger une pièce rare ou mieux',
  'offer-1': 'Publier une offre au Marché',
  'message-1': 'Écrire un message à la Taverne',
  'message-3': 'Écrire trois messages à la Taverne',
  'dungeon-end': 'Terminer une expédition au Donjon',
  'dungeon-win': 'Remporter une expédition au Donjon',
  'tournament-join': 'Participer à un tournoi',
  'tournament-win': 'Remporter un tournoi',
}

/** Symbole et page de chaque module dont une quête provient. */
const MODULES: Record<QuestModule, { kind: string; href: string }> = {
  realm: { kind: 'village', href: '/village' },
  forge: { kind: 'forge', href: '/forge' },
  dungeon: { kind: 'dungeon', href: '/dungeon' },
  tournament: { kind: 'tournament', href: '/tournament' },
  market: { kind: 'market', href: '/market' },
  tavern: { kind: 'tavern', href: '/tavern' },
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<QuestError['code'], string> = {
  QUEST_NOT_TODAY: "Cette quête n'est plus d'actualité.",
  NOT_COMPLETED: "La quête n'est pas encore accomplie.",
  ALREADY_CLAIMED: 'Récompense déjà récupérée.',
  NO_VILLAGE: 'Fondez un village pour recevoir votre or.',
  CHEST_LOCKED: 'Récupérez les trois récompenses pour ouvrir le coffre.',
  ALREADY_OPENED: 'Le coffre du jour est déjà ouvert.',
}

/**
 * Intervalle de relecture de secours : le temps réel suffit d'ordinaire, mais une connexion
 * interrompue ne doit pas laisser le tableau figé.
 */
const REFRESH_MS = 60_000

/** Durée restante lisible : « 7 h 12 », ou « 4 min ». */
function untilReset(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
    : `${minutes} min`
}

/**
 * L'or s'envole : des pièces jaillissent du bouton, décrivent un arc et rejoignent l'entrée du
 * Village dans la navigation, qui s'illumine à leur arrivée. Animation native du navigateur
 * (Web Animations), purement décorative, et omise si le système demande moins de mouvement.
 */
function flyCoins(from: Element, amount: number) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const target = document.querySelector('.nav a[href="/village"]')
  const start = from.getBoundingClientRect()
  const end = (target ?? from).getBoundingClientRect()
  const coins = Math.min(14, 6 + Math.round(amount / 10))
  for (let i = 0; i < coins; i++) {
    const coin = document.createElement('span')
    coin.className = 'flying-coin'
    coin.textContent = '🪙'
    coin.style.left = `${start.left + start.width / 2}px`
    coin.style.top = `${start.top + start.height / 2}px`
    document.body.append(coin)
    const dx = end.left + end.width / 2 - (start.left + start.width / 2)
    const dy = end.top + end.height / 2 - (start.top + start.height / 2)
    const spread = (i - coins / 2) * 14
    coin
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          {
            transform: `translate(calc(-50% + ${spread}px), calc(-50% - 40px)) scale(1.2)`,
            opacity: 1,
            offset: 0.2,
          },
          {
            transform: `translate(calc(-50% + ${dx * 0.55 + spread}px), calc(-50% + ${dy * 0.55 - 120}px)) scale(1)`,
            opacity: 1,
            offset: 0.6,
          },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`,
            opacity: 0.3,
          },
        ],
        {
          duration: 1100,
          delay: i * 55,
          easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
          fill: 'forwards',
        },
      )
      .finished.then(() => coin.remove())
  }
  // À l'arrivée de l'or, le Village s'illumine et annonce le gain.
  if (!target) return
  target.animate(
    [
      { transform: 'scale(1)', filter: 'none' },
      { transform: 'scale(1.18)', filter: 'drop-shadow(0 0 10px #ffd36b)' },
      { transform: 'scale(1)', filter: 'none' },
    ],
    { duration: 500, delay: 1000 + coins * 55, easing: 'ease-out' },
  )
  const gain = document.createElement('span')
  gain.className = 'coin-gain'
  gain.textContent = `+${amount} 🪙`
  gain.style.left = `${end.left + end.width / 2}px`
  gain.style.top = `${end.bottom}px`
  document.body.append(gain)
  gain
    .animate(
      [
        { transform: 'translate(-50%, 0)', opacity: 0 },
        { transform: 'translate(-50%, 6px)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, 26px)', opacity: 0 },
      ],
      { duration: 1600, delay: 950 + coins * 55, fill: 'forwards' },
    )
    .finished.then(() => gain.remove())
}

/**
 * Tableau des quêtes du jour. Affiché à droite de chaque écran du jeu, ou en grand sur la page
 * des quêtes. Il est relu à chaque changement de page et toutes les quinze secondes, puisque
 * les quêtes avancent avec ce que le joueur fait dans les autres modules.
 */
export function QuestBoard({ large = false }: { large?: boolean }) {
  const pathname = usePathname()
  const [view, setView] = useState<QuestBoardView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const offset = useRef(0)

  const refresh = useCallback(async () => {
    const res = await client.board.$get()
    if (!res.ok) return
    const { view: fresh } = await res.json()
    offset.current = fresh.asOf - Date.now()
    setView(fresh)
  }, [])

  // TEMPS RÉEL : le canal des Quêtes annonce les actions qui font avancer une quête, et celui
  // de la Taverne ses messages, qui ne sont pas des événements. Les annonces rapprochées ne
  // provoquent qu'une relecture : une seule est en cours à la fois, la suivante attend.
  const reading = useRef<Promise<void> | null>(null)
  const pending = useRef(false)
  const follow = useCallback(async () => {
    if (reading.current) {
      pending.current = true
      return
    }
    do {
      pending.current = false
      reading.current = refresh()
      await reading.current
      reading.current = null
    } while (pending.current)
  }, [refresh])
  useChannel(QUESTS_CHANNEL, follow)
  useChannel(TAVERN_CHANNEL, follow)

  // Relecture à chaque page visitée, au retour sur l'onglet, et à intervalle régulier.
  // biome-ignore lint/correctness/useExhaustiveDependencies: le changement de page est le déclencheur
  useEffect(() => {
    refresh()
  }, [refresh, pathname])
  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Au renouvellement de minuit, le tableau est relu.
  useEffect(() => {
    if (view && now >= view.resetsAt) refresh()
  }, [now, view, refresh])

  /** Récompense : la réponse contient le tableau à jour ; l'or s'envole vers le Village. */
  async function reward(request: Promise<Response>, button: HTMLElement, amount: number) {
    setBusy(true)
    try {
      const body = (await (await request).json()) as
        | { view: QuestBoardView }
        | { error: { code: QuestError['code'] } }
      if ('error' in body) {
        setError(ERRORS[body.error.code] ?? 'Erreur.')
        return
      }
      setError(null)
      flyCoins(button, amount)
      setView(body.view)
    } finally {
      setBusy(false)
    }
  }

  if (!view) return null
  const done = view.quests.filter((q) => q.done).length

  return (
    <section className="quest-board" data-large={large || undefined} aria-label="Quêtes du jour">
      <header className="quest-head">
        <strong>
          <Entity kind="quests" /> Quêtes du jour
        </strong>
        <span className="muted">
          nouvelles dans {untilReset(view.resetsAt - (now || view.asOf))}
        </span>
      </header>
      <p className="quest-earned">
        {done} / {view.quests.length} accomplies · <Entity kind="gold" /> {view.earnedToday} gagnées
        aujourd'hui
      </p>

      <ul className="quests">
        {view.quests.map((quest) => (
          <li
            key={quest.id}
            data-done={quest.done}
            data-claimed={quest.claimed}
            data-difficulty={quest.difficulty}
          >
            <span className="quest-check" aria-hidden="true">
              {quest.done ? '✓' : ''}
            </span>
            <div className="quest-body">
              <Link href={MODULES[quest.module].href} className="quest-label">
                <Entity kind={MODULES[quest.module].kind} /> {QUEST_LABELS[quest.id] ?? quest.id}
                <span className="sr-only">{quest.done ? ' (accomplie)' : ' (à faire)'}</span>
              </Link>
              <span className="quest-progress" aria-hidden="true">
                <span style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
              </span>
              <span className="quest-meta">
                <span className="muted">
                  {quest.progress} / {quest.target}
                </span>
                {quest.claimed ? (
                  <span className="quest-claimed">Récompense reçue</span>
                ) : quest.done ? (
                  <button
                    type="button"
                    className="quest-claim"
                    disabled={busy}
                    onClick={(event) =>
                      reward(
                        client.quests[':questId'].claim.$post({ param: { questId: quest.id } }),
                        event.currentTarget,
                        quest.reward,
                      )
                    }
                  >
                    Récupérer {quest.reward} <Entity kind="gold" />
                  </button>
                ) : (
                  <span className="muted">
                    {quest.reward} <Entity kind="gold" />
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="chest" data-ready={view.chest.ready} data-opened={view.chest.opened}>
        <span className="chest-glyph" aria-hidden="true">
          🎁
        </span>
        <span>
          <strong>Coffre du jour</strong>
          <span className="muted">
            {view.chest.opened
              ? ` · ouvert, +${view.chest.reward} or`
              : ` · ${view.chest.claimed} / ${view.quests.length} récompenses`}
          </span>
        </span>
        {view.chest.ready && (
          <button
            type="button"
            className="quest-claim"
            disabled={busy}
            onClick={(event) =>
              reward(client.chest.open.$post(), event.currentTarget, view.chest.reward)
            }
          >
            Ouvrir +{view.chest.reward} <Entity kind="gold" />
          </button>
        )}
      </div>
      {!view.hasVillage && <p className="muted">Fondez un village pour recevoir votre or.</p>}
      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}
    </section>
  )
}

/** Tableau des quêtes affiché à droite de l'espace de jeu, sauf sur la page des quêtes. */
export function QuestAside() {
  const pathname = usePathname()
  if (pathname.startsWith('/quests')) return null
  return <QuestBoard />
}

/** Page des quêtes : le tableau en grand, et le principe des quêtes. */
export function QuestsScreen() {
  return (
    <>
      <h1>
        <Entity kind="quests" /> Quêtes du jour
      </h1>
      <p className="muted">
        Chaque jour, trois quêtes vous attendent : une facile, une moyenne et une difficile, dans
        trois parties différentes du royaume. Elles se cochent d'elles-mêmes dès que vous les
        accomplissez ; récupérez alors leur or, puis ouvrez le coffre du jour. Les quêtes se
        renouvellent à minuit (UTC) : une récompense non récupérée est perdue.
      </p>
      <QuestBoard large />
    </>
  )
}
