import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'

/** Répertoires des modules métier. */
const MODULES = readdirSync(path.join(process.cwd(), 'src/modules'))

/**
 * Fonctions d'aptitude (TD11) : des règles d'architecture que dependency-cruiser ne peut pas
 * vérifier, parce qu'elles ne portent pas sur les importations, sont vérifiées par des tests.
 */
describe("Fonctions d'aptitude", () => {
  it("range chaque table dans le schéma d'une brique de la plateforme ou d'un module", async () => {
    const db = await createTestDatabase()
    const result = await db.execute(sql`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`)
    const schemas = (result as unknown as { rows: { table_schema: string }[] }).rows.map(
      (row) => row.table_schema,
    )

    // Aucune table dans le schéma public, et chaque schéma correspond à un propriétaire connu.
    const owners = ['platform', 'identity', ...MODULES]
    expect(schemas).not.toContain('public')
    for (const schema of schemas) expect(owners).toContain(schema)
  })

  it('déclare les données personnelles de chaque module qui conserve des données', () => {
    // Le module system ne conserve aucune donnée ; tous les autres doivent participer
    // aux droits des joueurs (TD10).
    const withData = MODULES.filter((module) => module !== 'system')
    for (const module of withData) {
      const file = path.join(process.cwd(), 'src/modules', module, 'personal-data.ts')
      expect(existsSync(file), `${module} n'a pas de fichier personal-data.ts`).toBe(true)
    }
  })

  it("ne laisse aucun domaine lire l'horloge ni le hasard : l'instant et la graine lui sont fournis", () => {
    // L'échéance d'une pièce de la Forge et le tableau d'un tournoi ne sont testables, et un
    // tournoi rejouable à l'identique, que si le domaine reçoit l'instant et la graine en
    // paramètres. Cette règle protège toutes les fonctions pures des modules.
    const forbidden = /Date\.now\(|new Date\(|Math\.random\(/
    for (const module of MODULES) {
      const domain = path.join(process.cwd(), 'src/modules', module, 'domain')
      if (!existsSync(domain)) continue
      for (const file of readdirSync(domain).filter(
        (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
      )) {
        const source = readFileSync(path.join(domain, file), 'utf8')
        expect(forbidden.test(source), `${module}/domain/${file} lit l'horloge ou le hasard`).toBe(
          false,
        )
      }
    }
  })
})
