'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import { useCountdown } from '@/ui/use-countdown'
import type { ForgeApi } from './api'
import {
  type Amounts,
  CATALOG,
  type ForgeError,
  type ForgeView,
  forgeChannel,
  type Rank,
  type Rarity,
  type Recipe,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<ForgeApi>('/api/forge')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Libellé de chaque rareté. */
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commune',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
}

/** Libellé de chaque rang du forgeron. */
const RANK_LABELS: Record<Rank, string> = {
  apprentice: 'Apprenti',
  journeyman: 'Compagnon',
  master: 'Maître forgeron',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ForgeError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Recette invalide.',
  UNKNOWN_RECIPE: 'Recette inconnue.',
  FORGE_BUSY: "L'enclume est déjà occupée.",
  RANK_TOO_LOW: 'Votre rang ne permet pas encore cette recette.',
  NO_ORDER: 'Aucune pièce en cours.',
  PAYMENT_PENDING: 'Le paiement est en cours.',
  NOT_READY: "La pièce n'est pas encore prête.",
  ALREADY_READY: 'La pièce est prête : récupérez-la.',
}

/** Durée lisible : « 45 s », « 2 min ». */
const duration = (ms: number) => (ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`)

/** Durée restante lisible, à partir d'un nombre de secondes : « 1:05 ». */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Affiche des quantités de ressources, avec leur symbole. */
function Cost({ amounts }: { amounts: Amounts }) {
  return (
    <span className="cost">
      {Object.entries(amounts).map(([resource, amount]) => (
        <span key={resource}>
          <Entity kind={resource} /> {amount}
        </span>
      ))}
    </span>
  )
}

/** Symbole d'une pièce, entouré du halo de sa rareté. */
function Gem({ recipe, size = 'md' }: { recipe: Recipe; size?: 'md' | 'lg' }) {
  return (
    <span className="gem" data-rarity={CATALOG[recipe].rarity} data-size={size}>
      <Entity kind={recipe} />
    </span>
  )
}

/** Étincelles de l'enclume : décoratives, ignorées par les lecteurs d'écran. */
function Sparks() {
  return (
    <span className="sparks" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe et purement décorative
        <i key={i} />
      ))}
    </span>
  )
}

/** Compte rendu de la dernière commande qui n'a pas abouti. */
function setbackText(view: ForgeView) {
  const setback = view.setback
  if (!setback) return null
  const name = look(setback.recipe).label
  if (setback.outcome === 'cancelled') return `${name} : commande annulée, ressources remboursées.`
  const missing = Object.entries(setback.missing ?? {})
    .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
    .join(', ')
  return `${name} : paiement refusé par le village, il manquait ${missing}.`
}

/** Écran de la Forge : enclume, recettes et armurerie, mis à jour en temps réel. */
export function ForgeScreen({ userId }: { userId: string }) {
  const [view, setView] = useState<ForgeView | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // REQUÊTE : la consultation distribue la boîte d'envoi, puis lit l'atelier.
  const refresh = useCallback(async () => {
    const res = await client.workshop.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : chaque événement de l'atelier, y compris la réponse du Village, provoque
  // une relecture de la vue.
  const status = useChannel(forgeChannel(userId), refresh)

  // ÉCHÉANCE : à la fin de la forge, la vue est relue ; le serveur la présente alors comme prête.
  const current = view?.current ?? null
  const remaining = useCountdown(current?.status === 'forging' ? current.readyAt : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  async function handle(request: Promise<Response>) {
    setBusy(true)
    try {
      const body = (await (await request).json()) as
        | { view: ForgeView }
        | { error: { code: string } }
      if ('error' in body) {
        setError(ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.')
      } else {
        setError(null)
        setView(body.view)
      }
    } finally {
      setBusy(false)
    }
  }
  const placeOrder = (recipe: Recipe) => handle(client.orders.$post({ json: { recipe } }))
  const cancel = () => handle(client.orders.current.cancel.$post())
  const collect = () => handle(client.orders.current.collect.$post())

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="forge" /> Forge
      </h1>
      <span className="status" data-status={status}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )
  if (!view) return title

  // Avancement de la forge, de 0 à 1, déduit du temps restant.
  const progress =
    current?.status === 'ready'
      ? 1
      : current?.status === 'forging' && remaining !== null
        ? 1 - (remaining * 1000) / current.durationMs
        : 0
  const setback = setbackText(view)

  return (
    <>
      {title}

      <section className="panel smith" aria-label="Forgeron">
        <div>
          <span className="rank">{RANK_LABELS[view.rank]}</span>
          <span className="muted">
            {view.nextRank
              ? `encore ${view.nextRank.remaining} pièce(s) avant ${RANK_LABELS[view.nextRank.rank]}`
              : 'rang le plus élevé atteint'}
          </span>
        </div>
        <div className="power">
          <strong>{view.power}</strong>
          <span className="muted">puissance de l'armurerie</span>
        </div>
      </section>

      <section
        className="anvil"
        aria-label="Enclume"
        data-state={current?.status ?? 'cold'}
        aria-live="polite"
      >
        {current ? (
          <>
            <div className="anvil-piece">
              <Gem recipe={current.recipe} size="lg" />
              {current.status === 'forging' && <Sparks />}
            </div>
            <div className="anvil-info">
              <span className="anvil-title">
                {look(current.recipe).label}{' '}
                <span className="rarity" data-rarity={CATALOG[current.recipe].rarity}>
                  {RARITY_LABELS[CATALOG[current.recipe].rarity]}
                </span>
              </span>
              {current.status === 'paying' && (
                <span className="anvil-note">Le village rassemble les ressources...</span>
              )}
              {current.status !== 'paying' && (
                <>
                  <span
                    className="heat"
                    role="progressbar"
                    aria-label="Avancement de la forge"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                  >
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                  <span className="anvil-note">
                    {current.status === 'ready'
                      ? 'La pièce est prête : refroidie, affûtée, gravée.'
                      : `Prête dans ${clock(remaining ?? 0)}`}
                  </span>
                </>
              )}
              <div className="actions">
                {current.status === 'ready' ? (
                  <button type="button" className="glow" disabled={busy} onClick={collect}>
                    Récupérer la pièce
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy || current.status === 'paying'}
                    onClick={cancel}
                  >
                    Annuler et être remboursé
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="anvil-note">L'enclume est froide. Choisissez une recette pour l'allumer.</p>
        )}
      </section>
      {(error || setback) && (
        <p className={error ? 'error' : 'muted'} role="status">
          {error ?? setback}
        </p>
      )}

      <section className="panel" aria-label="Recettes">
        <h2>Recettes</h2>
        <ul className="recipes">
          {view.recipes.map((r) => (
            <li key={r.recipe} className="recipe" data-rarity={r.rarity} data-locked={!r.unlocked}>
              <Gem recipe={r.recipe} />
              <span className="recipe-name">{look(r.recipe).label}</span>
              <span className="rarity" data-rarity={r.rarity}>
                {RARITY_LABELS[r.rarity]}
              </span>
              <Cost amounts={r.cost} />
              <span className="muted recipe-meta">
                {duration(r.durationMs)} · puissance {r.power}
              </span>
              {r.unlocked ? (
                <button
                  type="button"
                  disabled={busy || current !== null}
                  onClick={() => placeOrder(r.recipe)}
                >
                  Forger
                </button>
              ) : (
                <span className="lock">🔒 {RANK_LABELS[r.rank]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Armurerie">
        <h2>Armurerie</h2>
        {view.armory.length === 0 && (
          <p className="muted">Aucune pièce pour l'instant : vos créations seront exposées ici.</p>
        )}
        <ul className="armory">
          {view.armory.map((item) => (
            <li key={item.number} data-rarity={CATALOG[item.recipe].rarity}>
              <Gem recipe={item.recipe} />
              <span className="recipe-name">{look(item.recipe).label}</span>
              <span className="muted hallmark">
                n° {item.number} · poinçon de {item.smithName}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
