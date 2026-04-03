import { describe, expect, it } from 'vitest'
import { createPlannerState, parsePokemonCsv, updatePlannerState } from './planner'

describe('planner csv parsing', () => {
  it('parses CSV rows into structured plan entries', () => {
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
    expect(pokemon[1]).toMatchObject({
      owner: 'Daniel',
      moved: true,
    })
  })

  it('updates planner state deterministically', () => {
    const state = createPlannerState([
      'Number,Name,Image,Zugehörigkeit,Moved,Specialty 1,Specialty 2,Ideal Habitat,Favorite 1,Favorite 2,Favorite 3,Favorite 4,Favorite 5,Favorite 6',
      '#001,Bulbasaur,,Thomas,,Grow,,Bright,Nature,Soft,,,,',
    ].join('\n'))

    const updated = updatePlannerState(state, '#001', { owner: 'Shared', moved: true }, 123)

    expect(updated.updatedAt).toBe(123)
    expect(updated.pokemon[0].owner).toBe('Shared')
    expect(updated.pokemon[0].moved).toBe(true)
  })
})
