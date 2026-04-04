import { describe, expect, it } from 'vitest'
import {
  applySessionOverrides,
  createGroupId,
  createNextSessionGroupRecord,
  createNextSessionPlanRecord,
  parsePokemonCsv,
  upsertOverride,
} from './planner'

describe('planner csv parsing', () => {
  it('parses CSV rows into structured baseline entries without seeded owner/moved values', () => {
    const csv = [
      'Number,Name,Image,Zugehörigkeit,Moved,Specialty 1,Specialty 2,Ideal Habitat,Favorite 1,Favorite 2,Favorite 3,Favorite 4,Favorite 5,Favorite 6',
      '#001,Bulbasaur,,Thomas,,Grow,,Bright,Nature,Soft,,,,',
      '#007,Squirtle,,Daniel,Yes,Water,,Humid,Water,Clean,,,,',
    ].join('\n')

    const pokemon = parsePokemonCsv(csv)

    expect(pokemon).toHaveLength(2)
    expect(pokemon[0]).toMatchObject({
      number: '#001',
      name: 'Bulbasaur',
      owner: '',
      moved: false,
      specialties: ['Grow'],
      idealHabitat: 'Bright',
    })
    expect(pokemon[0].id).toBe('#001|Bulbasaur')
    expect(pokemon[1]).toMatchObject({
      owner: '',
      moved: false,
    })
  })

  it('ignores CSV owner and moved columns even when values are present', () => {
    const csv = [
      'Number,Name,Image,Zugehörigkeit,Moved,Specialty 1,Specialty 2,Ideal Habitat,Favorite 1,Favorite 2,Favorite 3,Favorite 4,Favorite 5,Favorite 6',
      '#025,Pikachu,,Thomas,Yes,Electric,,Plains,Berries,,,,,',
    ].join('\n')

    const [pokemon] = parsePokemonCsv(csv)

    expect(pokemon.owner).toBe('')
    expect(pokemon.moved).toBe(false)
  })

  it('applies session overrides without mutating CSV baseline', () => {
    const baseline = parsePokemonCsv(
      [
        'Number,Name,Image,Zugehörigkeit,Moved,Specialty 1,Specialty 2,Ideal Habitat,Favorite 1,Favorite 2,Favorite 3,Favorite 4,Favorite 5,Favorite 6',
        '#001,Bulbasaur,,Thomas,Yes,Grow,,Bright,Nature,Soft,,,,',
      ].join('\n'),
    )

    const overrides = upsertOverride({}, baseline[0].id, { owner: 'Ash', moved: true })
    const planned = applySessionOverrides(baseline, overrides)

    expect(baseline[0].owner).toBe('')
    expect(baseline[0].moved).toBe(false)
    expect(planned[0].owner).toBe('Ash')
    expect(planned[0].moved).toBe(true)
  })

  it('creates a monotonic session record timestamp with wall-clock input', () => {
    const current = {
      sessionId: 'group-a',
      updatedAt: 500,
      overrides: {},
      groups: {},
      pokemonGroupAssignments: {},
    }

    const next = createNextSessionPlanRecord(current, '#001|Bulbasaur', { moved: true }, 400)
    const nextWithFutureTime = createNextSessionPlanRecord(
      next,
      '#001|Bulbasaur',
      { owner: 'Shared' },
      800,
    )

    expect(next.updatedAt).toBe(501)
    expect(nextWithFutureTime.updatedAt).toBe(800)
  })

  it('creates group record updates while preserving plan overrides', () => {
    const current = {
      sessionId: 'group-a',
      updatedAt: 20,
      overrides: {
        '#001|Bulbasaur': { owner: 'Ash', moved: true },
      },
      groups: {},
      pokemonGroupAssignments: {},
    }

    const groupId = createGroupId('Ash', 'Bright', 1)

    const next = createNextSessionGroupRecord(
      current,
      {
        groups: {
          [groupId]: {
            id: groupId,
            owner: 'Ash',
            name: 'Bright',
            parentGroupId: null,
          },
        },
        pokemonGroupAssignments: {
          '#001|Bulbasaur': groupId,
        },
      },
      25,
    )

    expect(next.updatedAt).toBe(25)
    expect(next.overrides).toEqual(current.overrides)
    expect(next.groups[groupId]?.name).toBe('Bright')
    expect(next.pokemonGroupAssignments['#001|Bulbasaur']).toBe(groupId)
  })

  it('normalizes and truncates group ids consistently', () => {
    const groupId = createGroupId('  Ash Ketchum The Trainer  ', '  Bright   Biome Living Zone  ', 35)

    const [ownerPart, namePart, timestampPart] = groupId.split(':')
    expect(ownerPart).toHaveLength(16)
    expect(ownerPart).toBe('ash-ketchum-the-')
    expect(namePart).toBe('bright-biome-living-zone')
    // 35 in base-36 is "z"
    expect(timestampPart).toBe('z')
  })

  it('uses fallback tokens for empty owner or group names', () => {
    const groupId = createGroupId('   ', '   ', 1)

    expect(groupId).toBe('player:group:1')
  })
})
