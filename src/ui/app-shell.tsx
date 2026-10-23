'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'

/** Liens de navigation : chaque module ajouté au jeu y reçoit une entrée. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
  { href: '/forge', kind: 'forge', label: 'Forge' },
  { href: '/tournament', kind: 'tournament', label: 'Tournoi' },
  { href: '/quests', kind: 'quests', label: 'Quêtes' },
]

/**
 * Cadre de l'espace de jeu : navigation, nom du joueur, accès à ses données et déconnexion.
 * Le contenu de la colonne de droite (aside), s'il y en a un, est fourni par la page.
 */
export function AppShell({
  userName,
  aside,
  children,
}: {
  userName: string
  aside?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  // Menu du compte : il se referme à chaque changement de page.
  const accountMenu = useRef<HTMLDetailsElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: le changement de page est le déclencheur
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false
  }, [pathname])

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            <Entity kind={item.kind} /> {item.label}
          </Link>
        ))}
        <details className="account-menu" ref={accountMenu}>
          <summary aria-label={`Compte de ${userName}`}>
            <span aria-hidden="true">👤</span> {userName}
          </summary>
          <div className="account-items">
            <Link href="/account" aria-current={pathname === '/account' ? 'page' : undefined}>
              Mes données
            </Link>
            <button className="link" type="button" onClick={signOut}>
              Déconnexion
            </button>
          </div>
        </details>
      </nav>
      <div className="game-layout">
        <div className="game-main">{children}</div>
        {aside && <aside className="game-aside">{aside}</aside>}
      </div>
    </>
  )
}
