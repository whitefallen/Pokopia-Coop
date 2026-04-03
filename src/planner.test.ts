import { describe, expect, it } from 'vitest'
import { applySessionOverrides, parsePokemonCsv, upsertOverride } from './planner'

describe('planner csv parsing', () => {
  it('parses CSV rows into structured baseline entries', () => {
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
      owner: 'Thomas',
      moved: false,
      specialties: ['Grow'],
      idealHabitat: 'Bright',
    })
    expect(pokemon[0].id).toContain('#001-Bulbasaur')
    expect(pokemon[1]).toMatchObject({
      owner: 'Daniel',
      moved: true,
    })
  })

  it('applies session overrides without mutating CSV baseline', () => {
    const baseline = parsePokemonCsv(
      [
        'Number,Name,Image,Zugehörigkeit,Moved,Specialty 1,Specialty 2,Ideal Habitat,Favorite 1,Favorite 2,Favorite 3,Favorite 4,Favorite 5,Favorite 6',
        '#001,Bulbasaur,,Thomas,,Grow,,Bright,Nature,Soft,,,,',
      ].join('\n'),
    )

    const overrides = upsertOverride({}, baseline[0].id, { owner: 'Shared', moved: true })
    const planned = applySessionOverrides(baseline, overrides)

    expect(baseline[0].owner).toBe('Thomas')
    expect(baseline[0].moved).toBe(false)
    expect(planned[0].owner).toBe('Shared')
    expect(planned[0].moved).toBe(true)
  })
})
