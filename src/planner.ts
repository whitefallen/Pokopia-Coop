export type Owner = 'Thomas' | 'Daniel' | 'Shared'

export interface PokemonPlan {
  number: string
  name: string
  owner: Owner
  moved: boolean
  specialties: string[]
  idealHabitat: string
  favorites: string[]
}

export interface PlannerState {
  pokemon: PokemonPlan[]
  updatedAt: number
}

export interface PlanUpdate {
  owner?: Owner
  moved?: boolean
}

const VALID_OWNERS: ReadonlySet<string> = new Set(['Thomas', 'Daniel', 'Shared'])

function parseCsvRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  result.push(current.trim())
  return result
}

export function parsePokemonCsv(csvContent: string): PokemonPlan[] {
  const lines = csvContent
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (lines.length <= 1) {
    return []
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line)
    const owner = VALID_OWNERS.has(cells[3]) ? (cells[3] as Owner) : 'Shared'

    return {
      number: cells[0],
      name: cells[1],
      owner,
      moved: cells[4].toLowerCase() === 'yes',
      specialties: [cells[5], cells[6]].filter(Boolean),
      idealHabitat: cells[7] ?? '',
      favorites: cells.slice(8, 14).filter(Boolean),
    }
  })
}

export function createPlannerState(csvContent: string): PlannerState {
  return {
    pokemon: parsePokemonCsv(csvContent),
    updatedAt: Date.now(),
  }
}

export function updatePlannerState(
  state: PlannerState,
  pokemonNumber: string,
  update: PlanUpdate,
  now = Date.now(),
): PlannerState {
  return {
    pokemon: state.pokemon.map((pokemon) =>
      pokemon.number === pokemonNumber ? { ...pokemon, ...update } : pokemon,
    ),
    updatedAt: now,
  }
}
