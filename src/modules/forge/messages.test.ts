import { describe, expect, it } from 'vitest'
import type { Message } from '@/platform/outbox/outbox'
import type { ForgeService } from './application/forge-service'
import { FORGE_TOPICS } from './contracts'
import { createForgeHandlers } from './messages'

/** Service factice, qui retient les étapes de la saga qu'il reçoit. */
function fakeService() {
  const steps: unknown[][] = []
  const service = { step: async (...args: unknown[]) => void steps.push(args) }
  return {
    steps,
    handler: createForgeHandlers(service as unknown as ForgeService)[FORGE_TOPICS.transferResult],
  }
}

const reply = (payload: unknown) =>
  ({ id: 'm1', topic: FORGE_TOPICS.transferResult, payload }) as Message

describe('Messages de la Forge', () => {
  it("transmet la réponse du Village à l'atelier du joueur désigné par l'identifiant du mouvement", async () => {
    const { steps, handler } = fakeService()
    await handler?.(
      reply({ transferId: 'forge:2:pay:alice', outcome: 'refused', missing: { stone: 4 } }),
    )
    expect(steps).toEqual([
      [
        'alice',
        {
          type: 'RecordTransferResult',
          number: 2,
          step: 'pay',
          outcome: 'refused',
          missing: { stone: 4 },
        },
      ],
    ])
  })

  it("rejette une réponse dont l'identifiant n'est pas celui d'un mouvement de la Forge, sans toucher aucun atelier", async () => {
    const { steps, handler } = fakeService()
    await expect(
      handler?.(reply({ transferId: 'o1:reserve', outcome: 'withdrawn' })),
    ).rejects.toThrow()
    await expect(
      handler?.(reply({ transferId: 'forge:1:pay:alice', outcome: 'volé' })),
    ).rejects.toThrow()
    expect(steps).toEqual([])
  })
})
