export type Owner = string

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

export interface PlayerGroup {
  id: string
  owner: Owner
  name: string
  parentGroupId: string | null
}

export interface SessionPlanRecord {
  sessionId: string
  updatedAt: number
  overrides: Record<string, PlanUpdate>
  groups: Record<string, PlayerGroup>
  pokemonGroupAssignments: Record<string, string>
}

const MAX_GROUP_ID_OWNER_LENGTH = 16
const MAX_GROUP_ID_NAME_LENGTH = 24

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
    const owner = cells[3] || 'Shared'

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
  const nextUpdatedAt = now > current.updatedAt ? now : current.updatedAt + 1

  return {
    sessionId: current.sessionId,
    updatedAt: nextUpdatedAt,
    overrides: upsertOverride(current.overrides, pokemonId, update),
    groups: current.groups,
    pokemonGroupAssignments: current.pokemonGroupAssignments,
  }
}

export function createGroupId(owner: string, groupName: string, now = Date.now()): string {
  const ownerPart =
    owner.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_GROUP_ID_OWNER_LENGTH) || 'player'
  const namePart =
    groupName.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_GROUP_ID_NAME_LENGTH) ||
    'group'
  return `${ownerPart}:${namePart}:${now.toString(36)}`
}

export function createNextSessionGroupRecord(
  current: SessionPlanRecord,
  update: Pick<SessionPlanRecord, 'groups' | 'pokemonGroupAssignments'>,
  now = Date.now(),
): SessionPlanRecord {
  const nextUpdatedAt = now > current.updatedAt ? now : current.updatedAt + 1

  return {
    sessionId: current.sessionId,
    updatedAt: nextUpdatedAt,
    overrides: current.overrides,
    groups: update.groups,
    pokemonGroupAssignments: update.pokemonGroupAssignments,
  }
}
