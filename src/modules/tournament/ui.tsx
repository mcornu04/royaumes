'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import { useCountdown } from '@/ui/use-countdown'
import type { TournamentApi } from './api'
import {
  type Eligibility,
  ENTRY_REQUIREMENTS,
  type MatchView,
  PRIZES,
  ROUND_MS,
  ROUNDS,
  SEATS,
  type Shortfall,
  TACTICS,
  type Tactic,
  TOURNAMENT_CHANNEL,
  type TournamentError,
  type TournamentList,
  type TournamentView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<TournamentApi>('/api/tournament')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Présentation de chaque tactique. */
const TACTIC_INFO: Record<Tactic, { glyph: string; label: string; hint: string }> = {
  offensive: {
    glyph: '🗡️',
    label: 'Offensive',
    hint: "Frappe fort, se découvre. Déborde l'équilibrée.",
  },
  balanced: { glyph: '⚖️', label: 'Équilibrée', hint: 'Ni faille ni excès. Use la défensive.' },
  defensive: { glyph: '🛡️', label: 'Défensive', hint: "Pare et riposte. Brise l'offensive." },
}

/** Nom des tours, et colonne finale du champion. */
const ROUND_NAMES = ['Quarts de finale', 'Demi-finales', 'Finale']

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<TournamentError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Tactique invalide.',
  NOT_ELIGIBLE: "Vous ne remplissez pas encore les conditions d'entrée.",
  ALREADY_EXISTS: 'Ce tournoi existe déjà.',
  TOURNAMENT_NOT_FOUND: 'Tournoi introuvable.',
  NOT_OPEN: 'Les inscriptions sont closes.',
  ALREADY_JOINED: 'Vous êtes déjà inscrit.',
  FULL: 'Le tournoi est complet.',
  NOT_HOST: "Seul l'hôte peut lancer le tournoi.",
  NOT_FINISHED: "Le tournoi n'est pas terminé.",
}

/** Libellé d'une condition d'entrée manquante. */
function shortfallText(shortfall: Shortfall) {
  return shortfall.kind === 'building'
    ? `${look(shortfall.building).label} niveau ${shortfall.level} / ${shortfall.required}`
    : `${shortfall.forged} / ${shortfall.required} pièces forgées`
}

/** Heure de référence du serveur, recalée sur la dernière vue reçue et avancée localement. */
function useServerNow(asOf: number | undefined) {
  const offset = useRef(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (asOf !== undefined) offset.current = asOf - Date.now()
  }, [asOf])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 200)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** Conditions d'entrée : une jauge par bâtiment, une pour la forge, et la fiche du combattant. */
function Gate({ eligibility }: { eligibility: Eligibility }) {
  const { profile, stats } = eligibility
  const gauges = [
    ...(['sawmill', 'quarry', 'mine'] as const).map((building) => ({
      kind: building,
      label: look(building).label,
      value: profile.levels[building],
      required: ENTRY_REQUIREMENTS.buildingLevel,
      unit: 'niveau',
    })),
    {
      kind: 'forge',
      label: 'Forge',
      value: profile.forged,
      required: ENTRY_REQUIREMENTS.forgedPieces,
      unit: 'pièces',
    },
  ]
  return (
    <section className="panel gate" aria-label="Conditions d'entrée">
      <h2>{eligibility.eligible ? 'Vous êtes admis à concourir' : "Conditions d'entrée"}</h2>
      <ul className="gauges">
        {gauges.map((gauge) => {
          const done = gauge.value >= gauge.required
          return (
            <li key={gauge.kind} data-done={done}>
              <span className="gauge-label">
                <Entity kind={gauge.kind} /> {gauge.label}
              </span>
              <span className="gauge-bar" aria-hidden="true">
                <span
                  style={{ width: `${Math.min(100, (gauge.value / gauge.required) * 100)}%` }}
                />
              </span>
              <span className="gauge-value">
                {done ? '✓' : `${gauge.value} / ${gauge.required}`}{' '}
                <span className="sr-only">{gauge.unit}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <fieldset className="card-stats">
        <legend className="sr-only">Votre combattant</legend>
        <span>
          ⚔️ <strong>{stats.attack}</strong> attaque
        </span>
        <span>
          🛡️ <strong>{stats.defense}</strong> défense
        </span>
        <span>
          ❤️ <strong>{stats.hp}</strong> points de vie
        </span>
      </fieldset>
      {!eligibility.eligible && (
        <p className="muted">
          À atteindre : {eligibility.shortfalls.map(shortfallText).join(' · ')}.
        </p>
      )}
    </section>
  )
}

/** Choix de la tactique, en trois cartes. */
function TacticPicker({ value, onChange }: { value: Tactic; onChange: (tactic: Tactic) => void }) {
  return (
    <fieldset className="tactics">
      <legend className="sr-only">Tactique</legend>
      {TACTICS.map((tactic) => (
        <button
          key={tactic}
          type="button"
          aria-pressed={value === tactic}
          className="tactic"
          data-selected={value === tactic}
          onClick={() => onChange(tactic)}
        >
          <span className="tactic-glyph" aria-hidden="true">
            {TACTIC_INFO[tactic].glyph}
          </span>
          <strong>{TACTIC_INFO[tactic].label}</strong>
          <span className="tactic-hint">{TACTIC_INFO[tactic].hint}</span>
        </button>
      ))}
    </fieldset>
  )
}

/** Combattant d'une case du tableau ; null si la case n'est pas encore connue. */
function Slot({
  view,
  seat,
  state,
}: {
  view: TournamentView
  seat: number | null
  state: 'pending' | 'live' | 'won' | 'lost'
}) {
  const entrant = seat === null ? null : view.entrants[seat]
  return (
    <span
      className="slot"
      data-state={state}
      data-me={entrant?.isMe || undefined}
      // La clé change lorsqu'un combattant arrive dans la case : son entrée est animée.
      key={seat ?? 'vide'}
    >
      {entrant ? (
        <>
          <Entity kind={entrant.bot ? 'knight' : 'hero'} />
          <span className="slot-name">{entrant.name}</span>
          <span className="slot-tactic" title={TACTIC_INFO[entrant.tactic].label}>
            {TACTIC_INFO[entrant.tactic].glyph}
          </span>
        </>
      ) : (
        <span className="slot-name muted">?</span>
      )}
    </span>
  )
}

/** Tableau du tournoi : les tours en colonnes, reliés par des branches, puis le champion. */
function Bracket({ view }: { view: TournamentView }) {
  const columns = ROUND_NAMES.map((name, round) => {
    const matches = view.rounds[round] ?? []
    const count = SEATS / 2 ** (round + 1)
    return {
      name,
      matches: Array.from({ length: count }, (_, i): MatchView | null => matches[i] ?? null),
    }
  })
  const slotState = (match: MatchView, seat: number) =>
    match.winner === null ? 'live' : match.winner === seat ? 'won' : 'lost'

  return (
    <section className="panel" aria-label="Tableau du tournoi">
      <h2>Tableau</h2>
      <div className="bracket">
        {columns.map((column, round) => (
          <div key={column.name} className="bracket-round">
            <span className="bracket-title">{column.name}</span>
            <div className="bracket-matches">
              {column.matches.map((match, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: les cases du tableau sont fixes
                  key={i}
                  className="bracket-match"
                  data-decided={match?.winner != null}
                  data-live={match !== null && match.winner === null && round === view.round}
                >
                  <Slot
                    view={view}
                    seat={match?.a ?? null}
                    state={match ? slotState(match, match.a) : 'pending'}
                  />
                  <Slot
                    view={view}
                    seat={match?.b ?? null}
                    state={match ? slotState(match, match.b) : 'pending'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="bracket-round champion-column">
          <span className="bracket-title">Champion</span>
          <div className="bracket-matches">
            <div className="bracket-match champion" data-decided={view.champion !== null}>
              {view.champion !== null && (
                <span className="crown" aria-hidden="true">
                  👑
                </span>
              )}
              <Slot
                view={view}
                seat={view.champion}
                state={view.champion === null ? 'pending' : 'won'}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Carte d'un combattant dans l'arène, avec sa barre de vie. */
function ArenaFighter({
  view,
  seat,
  hp,
  hit,
  damage,
}: {
  view: TournamentView
  seat: number
  hp: number
  /** Numéro du coup reçu : la carte tremble à chaque nouveau coup. */
  hit: number | null
  damage: number | null
}) {
  const entrant = view.entrants[seat]
  if (!entrant) return null
  const ratio = Math.max(0, hp / entrant.stats.hp)
  return (
    <div className="arena-fighter" data-me={entrant.isMe || undefined} data-down={hp <= 0}>
      <span className="arena-portrait" key={hit ?? 'calme'} data-hit={hit !== null}>
        <Entity kind={entrant.bot ? 'knight' : 'hero'} />
        {damage !== null && <span className="damage">-{damage}</span>}
      </span>
      <strong>{entrant.name}</strong>
      <span className="muted">
        {TACTIC_INFO[entrant.tactic].glyph} {TACTIC_INFO[entrant.tactic].label} · ⚔️{' '}
        {entrant.stats.attack} · 🛡️ {entrant.stats.defense}
      </span>
      <span
        className="hp"
        role="progressbar"
        aria-label="Points de vie"
        aria-valuemin={0}
        aria-valuemax={entrant.stats.hp}
        aria-valuenow={hp}
      >
        <span data-low={ratio < 0.3} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="hp-text">
        {hp} / {entrant.stats.hp} PV {hp <= 0 && <strong className="ko">K.O.</strong>}
      </span>
    </div>
  )
}

/**
 * Arène : le duel choisi du tour en cours, rejoué coup par coup pendant les quatre premiers
 * cinquièmes du tour, d'après les échanges calculés par le serveur.
 */
function Arena({ view, now }: { view: TournamentView; now: number }) {
  const live = view.rounds[view.round] ?? []
  const mine = live.findIndex(
    (match) => view.entrants[match.a]?.isMe || view.entrants[match.b]?.isMe,
  )
  const [picked, setPicked] = useState<number | null>(null)
  const index = picked !== null && picked < live.length ? picked : Math.max(0, mine)
  const match = live[index]
  if (!match || view.roundStartedAt === null) return null

  const progress = Math.min(1, Math.max(0, (now - view.roundStartedAt) / (ROUND_MS * 0.8)))
  const shown = Math.floor(progress * match.exchanges.length)
  const last = shown > 0 ? match.exchanges[shown - 1] : null
  const hpA = last ? last.hpA : (view.entrants[match.a]?.stats.hp ?? 0)
  const hpB = last ? last.hpB : (view.entrants[match.b]?.stats.hp ?? 0)
  const nameOf = (seat: number) => view.entrants[seat]?.name ?? '?'

  return (
    <section className="arena" aria-label="Arène">
      <div className="arena-head">
        <span className="arena-round">{ROUND_NAMES[view.round]}</span>
        {live.length > 1 && (
          <div className="arena-tabs">
            {live.map((m, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: les matchs d'un tour sont fixes
                key={i}
                type="button"
                className="link"
                aria-pressed={i === index}
                onClick={() => setPicked(i)}
              >
                {nameOf(m.a)} – {nameOf(m.b)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="arena-floor">
        <ArenaFighter
          view={view}
          seat={match.a}
          hp={hpA}
          hit={last?.attacker === 'b' ? shown : null}
          damage={last?.attacker === 'b' ? last.damage : null}
        />
        <span className="versus" aria-hidden="true">
          VS
        </span>
        <ArenaFighter
          view={view}
          seat={match.b}
          hp={hpB}
          hit={last?.attacker === 'a' ? shown : null}
          damage={last?.attacker === 'a' ? last.damage : null}
        />
      </div>
      <p className="arena-log" aria-live="polite">
        {last
          ? `${nameOf(last.attacker === 'a' ? match.a : match.b)} frappe ${nameOf(
              last.attacker === 'a' ? match.b : match.a,
            )} : ${last.damage} dégâts.`
          : 'Les combattants se saluent...'}
      </p>
    </section>
  )
}

/** Écran d'un tournoi : inscrits, arène et tableau. */
function TournamentDetail({
  view,
  tactic,
  onCommand,
  onBack,
  busy,
}: {
  view: TournamentView
  tactic: Tactic
  onCommand: (request: Promise<Response>) => void
  onBack: () => void
  busy: boolean
}) {
  const now = useServerNow(view.asOf)
  const remaining =
    view.roundEndsAt === null ? null : Math.max(0, Math.ceil((view.roundEndsAt - now) / 1000))
  const champion = view.champion === null ? null : view.entrants[view.champion]
  const param = { param: { id: view.tournamentId } }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="link" onClick={onBack}>
          ← Tous les tournois
        </button>
        <span className="muted">
          Tournoi de {view.hostName}
          {view.status === 'running' && remaining !== null && (
            <>
              {' '}
              · {ROUND_NAMES[view.round]} : <span className="countdown">{remaining} s</span>
            </>
          )}
        </span>
      </div>

      {view.status === 'open' && (
        <section className="panel" aria-label="Inscrits">
          <h2>
            Inscrits ({view.entrants.length} / {SEATS})
          </h2>
          <ul className="seats">
            {Array.from({ length: SEATS }, (_, seat) => {
              const entrant = view.entrants[seat]
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: les places sont fixes
                <li key={seat} data-empty={!entrant} data-me={entrant?.isMe || undefined}>
                  {entrant ? (
                    <>
                      <Entity kind="hero" /> {entrant.name} {TACTIC_INFO[entrant.tactic].glyph}
                    </>
                  ) : (
                    <span className="muted">
                      <Entity kind="knight" /> chevalier de l'ordinateur
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="actions">
            {!view.joined && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onCommand(client.tournaments[':id'].join.$post({ ...param, json: { tactic } }))
                }
              >
                Rejoindre ({TACTIC_INFO[tactic].label.toLowerCase()})
              </button>
            )}
            {view.isHost && (
              <button
                type="button"
                className="glow"
                disabled={busy}
                onClick={() => onCommand(client.tournaments[':id'].start.$post(param))}
              >
                Lancer le tournoi
              </button>
            )}
            {!view.isHost && view.joined && (
              <p className="muted">En attente du lancement par {view.hostName}.</p>
            )}
          </div>
        </section>
      )}

      {/* Une arène par tour : le match choisi pendant un tour ne survit pas au tour suivant. */}
      {view.status === 'running' && <Arena key={view.round} view={view} now={now} />}

      {champion && (
        <section className="champion-banner" aria-live="polite">
          <span className="crown" aria-hidden="true">
            👑
          </span>
          <span>
            <strong>{champion.name}</strong> remporte le tournoi
            {champion.isMe && ` : ${PRIZES.champion.gold} pièces d'or rejoignent votre village !`}
          </span>
        </section>
      )}

      {view.status !== 'open' && <Bracket view={view} />}
    </>
  )
}

/** Écran du Tournoi : conditions d'entrée, tournois, arène et tableau. */
export function TournamentScreen() {
  const [eligibility, setEligibility] = useState<Eligibility | undefined>(undefined)
  const [list, setList] = useState<TournamentList | undefined>(undefined)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<TournamentView | null>(null)
  const [tactic, setTactic] = useState<Tactic>('balanced')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // REQUÊTES : admission, liste des tournois, et tournoi consulté.
  const refresh = useCallback(async () => {
    const [admission, tournaments] = await Promise.all([
      client.eligibility.$get(),
      client.tournaments.$get(),
    ])
    if (admission.ok) setEligibility(await admission.json())
    if (tournaments.ok) setList(await tournaments.json())
  }, [])
  const refreshView = useCallback(async () => {
    if (!selected) return
    const res = await client.tournaments[':id'].$get({ param: { id: selected } })
    if (res.ok) setView((await res.json()).view)
  }, [selected])

  useEffect(() => {
    refresh()
  }, [refresh])
  useEffect(() => {
    setView(null)
    refreshView()
  }, [refreshView])

  // TEMPS RÉEL : chaque annonce du canal du Tournoi provoque une relecture.
  const status = useChannel(TOURNAMENT_CHANNEL, async () => {
    await Promise.all([refresh(), refreshView()])
  })

  // ÉCHÉANCE : à la fin de chaque tour, la vue est relue et le tour suivant dévoilé.
  useCountdown(view?.roundEndsAt ?? null, refreshView)

  /** Commande : la réponse contient la vue du tournoi, ou une erreur. */
  async function command(request: Promise<Response>) {
    setBusy(true)
    try {
      const body = (await (await request).json()) as
        | { view: TournamentView; tournamentId?: string }
        | { error: { code: string } }
      if ('error' in body) {
        setError(ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.')
      } else {
        setError(null)
        setSelected(body.view.tournamentId)
        setView(body.view)
        await refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="tournament" /> Tournoi
      </h1>
      <span className="status" data-status={status}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )
  if (!eligibility) return title

  return (
    <>
      {title}
      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}

      {selected && view ? (
        <TournamentDetail
          view={view}
          tactic={tactic}
          onCommand={command}
          onBack={() => setSelected(null)}
          busy={busy}
        />
      ) : (
        <>
          <Gate eligibility={eligibility} />

          <section className="panel" aria-label="Votre tactique">
            <h2>Votre tactique</h2>
            <TacticPicker value={tactic} onChange={setTactic} />
            <div className="actions">
              <button
                type="button"
                disabled={busy || !eligibility.eligible}
                onClick={() => command(client.tournaments.$post({ json: { tactic } }))}
              >
                Ouvrir un tournoi
              </button>
              <span className="muted">
                {ROUNDS} tours de {ROUND_MS / 1000} s · récompenses : {PRIZES.champion.gold}{' '}
                <Entity kind="gold" /> au champion, {PRIZES.finalist.gold} <Entity kind="gold" /> au
                finaliste
              </span>
            </div>
          </section>

          <section className="panel" aria-label="Tournois">
            <h2>Tournois</h2>
            {list?.tournaments.length === 0 && (
              <p className="muted">Aucun tournoi pour l'instant : ouvrez le premier.</p>
            )}
            <ul className="offers">
              {list?.tournaments.map((t) => (
                <li key={t.tournamentId}>
                  <span>
                    Tournoi de <strong>{t.hostName}</strong>{' '}
                    <span className="muted">
                      {t.status === 'open'
                        ? `· inscriptions ouvertes (${t.entrants} / ${SEATS})`
                        : '· lancé'}
                    </span>
                  </span>
                  <button type="button" onClick={() => setSelected(t.tournamentId)}>
                    {t.status === 'open' ? 'Voir et rejoindre' : 'Regarder'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  )
}
