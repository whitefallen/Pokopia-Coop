export type Owner = 'Thomas' | 'Daniel' | 'Shared'

export interface PokemonPlan {
  id: string
  number: string
  name: string
  owner: Owner
  moved: boolean
  specialties: string[]
  idealHabitat: string
  favorites: string[]
}

export interface PlanUpdate {
  owner?: Owner
  moved?: boolean
}

export interface SessionPlanRecord {
  sessionId: string
  updatedAt: number
  overrides: Record<string, PlanUpdate>
}

const VALID_OWNERS: ReadonlySet<string> = new Set(['Thomas', 'Daniel', 'Shared'])

function createPokemonId(number: string, name: string): string {
  return `${number}|${name}`
}

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
      id: createPokemonId(cells[0], cells[1]),
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

export function applySessionOverrides(
  baselinePokemon: PokemonPlan[],
  overrides: Record<string, PlanUpdate>,
): PokemonPlan[] {
  return baselinePokemon.map((pokemon) => {
    const override = overrides[pokemon.id]
    if (!override) {
      return pokemon
    }

    return {
      ...pokemon,
      owner: override.owner ?? pokemon.owner,
      moved: override.moved ?? pokemon.moved,
    }
  })
}

export function upsertOverride(
  current: Record<string, PlanUpdate>,
  pokemonId: string,
  update: PlanUpdate,
): Record<string, PlanUpdate> {
  return {
    ...current,
    [pokemonId]: {
      ...current[pokemonId],
      ...update,
    },
  }
}

export function createNextSessionPlanRecord(
  current: SessionPlanRecord,
  pokemonId: string,
  update: PlanUpdate,
  now = Date.now(),
): SessionPlanRecord {
  return {
    sessionId: current.sessionId,
    updatedAt: now > current.updatedAt ? now : current.updatedAt + 1,
    overrides: upsertOverride(current.overrides, pokemonId, update),
  }
}
