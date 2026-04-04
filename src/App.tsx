import { useEffect, useMemo, useState, type ReactElement } from 'react'
import csvBaseline from '../pokopia_assignment - Sheet1.csv?raw'
import {
  applySessionOverrides,
  createGroupId,
  createNextSessionGroupRecord,
  createNextSessionPlanRecord,
  parsePokemonCsv,
  type PlayerGroup,
  type PlanUpdate,
  type SessionPlanRecord,
} from './planner'
import {
  createSessionId,
  normalizePlayerName,
  resolvePlayerName,
  resolveSessionId,
  setPlayerName as persistPlayerName,
} from './session'
import { loadSessionPlan, saveSessionPlan } from './sessionDb'
import './App.css'

const CHANNEL_PREFIX = 'pokopia-coop-sync:'
const normalizeSessionPlanRecord = (record: SessionPlanRecord): SessionPlanRecord => ({
  sessionId: record.sessionId,
  updatedAt: record.updatedAt,
  overrides: record.overrides ?? {},
  groups: record.groups ?? {},
  pokemonGroupAssignments: record.pokemonGroupAssignments ?? {},
})
const removePokemonGroupAssignment = (
  assignments: Record<string, string>,
  pokemonId: string,
): Record<string, string> =>
  Object.fromEntries(Object.entries(assignments).filter(([id]) => id !== pokemonId))
const renderGroupBranch = (
  group: PlayerGroup,
  groupChildrenByParent: Map<string, PlayerGroup[]>,
  groupedPokemonByGroup: Map<string, ReturnType<typeof parsePokemonCsv>>,
  visitedIds: Set<string>,
): ReactElement => {
  if (visitedIds.has(group.id)) {
    return (
      <li key={group.id}>
        <strong>{group.name}</strong> <span>(cycle detected)</span>
      </li>
    )
  }

  const nextVisitedIds = new Set(visitedIds)
  nextVisitedIds.add(group.id)
  const children = groupChildrenByParent.get(group.id) ?? []
  const pokemonInGroup = groupedPokemonByGroup.get(group.id) ?? []

  return (
    <li key={group.id}>
      <strong>{group.name}</strong> <span>({pokemonInGroup.length})</span>
      {pokemonInGroup.length ? (
        <ul>
          {pokemonInGroup.map((pokemon) => (
            <li key={`${group.id}-${pokemon.id}`}>{pokemon.name}</li>
          ))}
        </ul>
      ) : null}
      {children.length ? (
        <ul>
          {children.map((childGroup) =>
            renderGroupBranch(childGroup, groupChildrenByParent, groupedPokemonByGroup, nextVisitedIds),
          )}
        </ul>
      ) : null}
    </li>
  )
}

function App() {
  const [sessionId] = useState(resolveSessionId)
  const [playerName, setPlayerName] = useState(() => resolvePlayerName(sessionId))
  const [playerInput, setPlayerInput] = useState('')
  const [pendingExistingPlayer, setPendingExistingPlayer] = useState('')
  const [copiedShareLink, setCopiedShareLink] = useState(false)
  const [sessionPlan, setSessionPlan] = useState<SessionPlanRecord>({
    sessionId,
    updatedAt: 0,
    overrides: {},
    groups: {},
    pokemonGroupAssignments: {},
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupParent, setNewGroupParent] = useState('')

  const baselinePokemon = useMemo(() => parsePokemonCsv(csvBaseline), [])
  const shareLink = useMemo(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('session', sessionId)
    url.searchParams.delete('player')
    return url.toString()
  }, [sessionId])

  const plannedPokemon = useMemo(
    () => applySessionOverrides(baselinePokemon, sessionPlan.overrides),
    [baselinePokemon, sessionPlan.overrides],
  )

  const ownerOptions = useMemo(() => {
    const fromPlan = plannedPokemon.map((pokemon) => pokemon.owner)
    const all = new Set(['Shared', ...fromPlan])
    if (playerName) {
      all.add(playerName)
    }
    return Array.from(all).sort((left, right) => {
      if (left === 'Shared') {
        return -1
      }
      if (right === 'Shared') {
        return 1
      }
      return left.localeCompare(right)
    })
  }, [playerName, plannedPokemon])

  const knownPlayers = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(sessionPlan.overrides)
            .map((override) => override.owner?.trim())
            .filter((owner): owner is string => Boolean(owner && owner !== 'Shared')),
        ),
      ),
    [sessionPlan.overrides],
  )
  const normalizedKnownPlayers = useMemo(
    () =>
      knownPlayers.map((knownPlayer) => ({
        original: knownPlayer,
        normalized: knownPlayer.toLowerCase(),
      })),
    [knownPlayers],
  )
  const showPlayerPrompt = playerName.length === 0
  const canPlan = !showPlayerPrompt

  useEffect(() => {
    let isActive = true

    void loadSessionPlan(sessionId)
      .then((stored) => {
        if (!isActive || !stored) {
          return
        }

        const normalized = normalizeSessionPlanRecord(stored)
        setSessionPlan((current) => (normalized.updatedAt > current.updatedAt ? normalized : current))
      })
      .catch(() => {
        // ignore db read errors and continue with baseline
      })

    return () => {
      isActive = false
    }
  }, [sessionId])

  useEffect(() => {
    const channelName = `${CHANNEL_PREFIX}${sessionId}`
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

    const handleMessage = (event: MessageEvent<SessionPlanRecord>) => {
      if (!event.data) {
        return
      }
      const next = normalizeSessionPlanRecord(event.data)
      if (next?.updatedAt) {
        setSessionPlan((current) => (next.updatedAt > current.updatedAt ? next : current))
      }
    }

    channel?.addEventListener('message', handleMessage)

    return () => {
      channel?.removeEventListener('message', handleMessage)
      channel?.close()
    }
  }, [sessionId])

  const visiblePokemon = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return plannedPokemon.filter((pokemon) => {
      const ownerMatch = ownerFilter === 'All' || pokemon.owner === ownerFilter
      const searchMatch =
        normalizedSearch.length === 0 ||
        pokemon.name.toLowerCase().includes(normalizedSearch) ||
        pokemon.number.toLowerCase().includes(normalizedSearch)

      return ownerMatch && searchMatch
    })
  }, [ownerFilter, plannedPokemon, searchTerm])

  const movedCount = useMemo(
    () => plannedPokemon.filter((pokemon) => pokemon.moved).length,
    [plannedPokemon],
  )
  const assignedToCurrentPlayer = useMemo(
    () => plannedPokemon.filter((pokemon) => pokemon.owner === playerName),
    [plannedPokemon, playerName],
  )
  const playerGroups = useMemo(
    () =>
      Object.values(sessionPlan.groups).filter(
        (group): group is PlayerGroup => group.owner === playerName,
      ),
    [playerName, sessionPlan.groups],
  )
  const playerGroupNameById = useMemo(
    () => new Map(playerGroups.map((group) => [group.id, group.name])),
    [playerGroups],
  )
  const playerGroupChildrenByParent = useMemo(() => {
    const map = new Map<string, PlayerGroup[]>()

    for (const group of playerGroups) {
      const parentKey = group.parentGroupId ?? ''
      const existing = map.get(parentKey) ?? []
      existing.push(group)
      map.set(parentKey, existing)
    }

    return map
  }, [playerGroups])
  const groupedPokemonByGroup = useMemo(() => {
    const grouped = new Map<string, typeof assignedToCurrentPlayer>()
    for (const pokemon of assignedToCurrentPlayer) {
      const groupId = sessionPlan.pokemonGroupAssignments[pokemon.id]
      if (!groupId) {
        continue
      }
      const existing = grouped.get(groupId) ?? []
      existing.push(pokemon)
      grouped.set(groupId, existing)
    }
    return grouped
  }, [assignedToCurrentPlayer, sessionPlan.pokemonGroupAssignments])
  const ungroupedAssignedPokemon = useMemo(
    () =>
      assignedToCurrentPlayer.filter((pokemon) => !sessionPlan.pokemonGroupAssignments[pokemon.id]),
    [assignedToCurrentPlayer, sessionPlan.pokemonGroupAssignments],
  )

  const persistUpdate = (pokemonId: string, update: PlanUpdate) => {
    setSessionPlan((current) => {
      const next = createNextSessionPlanRecord(current, pokemonId, update)
      void saveSessionPlan(next)

      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${sessionId}`)
        channel.postMessage(next)
        channel.close()
      }

      return next
    })
  }
  const persistGroupUpdate = (
    update: Pick<SessionPlanRecord, 'groups' | 'pokemonGroupAssignments'>,
  ) => {
    setSessionPlan((current) => {
      const next = createNextSessionGroupRecord(current, update)
      void saveSessionPlan(next)

      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${sessionId}`)
        channel.postMessage(next)
        channel.close()
      }

      return next
    })
  }

  const handlePlayerNameSubmit = (rawValue: string, options?: { skipCollisionCheck?: boolean }) => {
    const normalized = normalizePlayerName(rawValue)
    if (!normalized) {
      return
    }
    const normalizedLower = normalized.toLowerCase()

    const matchingKnownPlayer = normalizedKnownPlayers.find(
      (knownPlayer) => knownPlayer.normalized === normalizedLower,
    )?.original

    if (
      !options?.skipCollisionCheck &&
      playerName.length === 0 &&
      matchingKnownPlayer
    ) {
      setPendingExistingPlayer(matchingKnownPlayer)
      return
    }

    persistPlayerName(sessionId, normalized)
    setPlayerName(normalized)
    setPlayerInput(normalized)
    setPendingExistingPlayer('')
  }

  const createNewSession = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('session', createSessionId())
    url.searchParams.delete('player')
    window.location.assign(url.toString())
  }

  const copyShareLink = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }
    await navigator.clipboard.writeText(shareLink)
    setCopiedShareLink(true)
    window.setTimeout(() => setCopiedShareLink(false), 1200)
  }
  const createPlayerGroup = () => {
    const groupName = newGroupName.trim()
    if (!groupName || !playerName) {
      return
    }
    const groupId = createGroupId(playerName, groupName)
    persistGroupUpdate({
      groups: {
        ...sessionPlan.groups,
        [groupId]: {
          id: groupId,
          owner: playerName,
          name: groupName,
          parentGroupId: newGroupParent || null,
        },
      },
      pokemonGroupAssignments: sessionPlan.pokemonGroupAssignments,
    })
    setNewGroupName('')
    setNewGroupParent('')
  }
  const assignPokemonToGroup = (pokemonId: string, groupId: string) => {
    persistGroupUpdate({
      groups: sessionPlan.groups,
      pokemonGroupAssignments: groupId
        ? { ...sessionPlan.pokemonGroupAssignments, [pokemonId]: groupId }
        : removePokemonGroupAssignment(sessionPlan.pokemonGroupAssignments, pokemonId),
    })
  }
  return (
    <main className="app">
      <header className="header">
        <h1>Pokopia Cooperative Planner</h1>
        <p>Plan flow: create/share session → choose player identity → assign and track moved Pokémon.</p>
      </header>

      <section className="step-card" aria-label="Step 1 session setup">
        <p className="step-label">Step 1</p>
        <h2>Session setup</h2>
        <p>
          Session: <code>{sessionId}</code>
        </p>
        <div className="session-actions">
          <button type="button" onClick={createNewSession}>
            Create new session
          </button>
          <button type="button" onClick={() => void copyShareLink()}>
            {copiedShareLink ? 'Copied' : 'Copy share link'}
          </button>
          <input
            aria-label="Shareable session link"
            placeholder="Shareable session link"
            readOnly
            value={shareLink}
          />
        </div>
      </section>

      <section className="step-card" aria-label="Step 2 player identity">
        <p className="step-label">Step 2</p>
        <h2>Player identity</h2>
        {showPlayerPrompt ? (
          <section className="player-prompt" aria-label="Join session">
            <p>Enter your player name so assignments can be tracked by session + player.</p>
            <div className="player-controls">
              <input
                aria-label="Player name"
                value={playerInput}
                onChange={(event) => setPlayerInput(event.target.value)}
                placeholder="Your name"
              />
              <button type="button" onClick={() => handlePlayerNameSubmit(playerInput)}>
                Continue
              </button>
            </div>
            {knownPlayers.length > 0 ? (
              <div className="known-players">
                <span>Known players in this session:</span>
                {knownPlayers.map((knownPlayer) => (
                  <button
                    key={knownPlayer}
                    type="button"
                    onClick={() => handlePlayerNameSubmit(knownPlayer, { skipCollisionCheck: true })}
                  >
                    {knownPlayer}
                  </button>
                ))}
              </div>
            ) : null}
            {pendingExistingPlayer ? (
              <div className="existing-player-choice">
                <p>
                  "{pendingExistingPlayer}" already exists in this session. Join that player or use a new
                  name.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handlePlayerNameSubmit(pendingExistingPlayer, { skipCollisionCheck: true })
                  }
                >
                  Join as {pendingExistingPlayer}
                </button>
                <button type="button" onClick={() => setPendingExistingPlayer('')}>
                  Use a new name
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="player-active">
            You are planning as <code>{playerName}</code>.
          </p>
        )}
      </section>

      <section className="step-card" aria-label="Step 3 planner workspace">
        <p className="step-label">Step 3</p>
        <h2>Planner workspace</h2>
        {!canPlan ? (
          <div className="planner-locked" role="status" aria-live="polite">
            Complete Step 2 to start planning in this session.
          </div>
        ) : (
          <>
            <section className="stats" aria-label="Planner summary">
              <span>Total Pokémon: {plannedPokemon.length}</span>
              <span>Moved: {movedCount}</span>
              <span>Pending: {plannedPokemon.length - movedCount}</span>
            </section>

            <section className="controls" aria-label="Filters">
              <label>
                Search
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Name or number"
                />
              </label>

              <label>
                Owner
                <select
                  aria-label="Owner filter"
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Owner</th>
                    <th>Moved</th>
                    <th>Specialties</th>
                    <th>Habitat</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePokemon.map((pokemon) => (
                    <tr key={pokemon.id}>
                      <td>{pokemon.number}</td>
                      <td>{pokemon.name}</td>
                      <td>
                        <select
                          aria-label={`Owner for ${pokemon.name}`}
                          value={pokemon.owner}
                          onChange={(event) => persistUpdate(pokemon.id, { owner: event.target.value })}
                        >
                          {ownerOptions.map((owner) => (
                            <option key={`${pokemon.id}-${owner}`} value={owner}>
                              {owner}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Moved status for ${pokemon.name}`}
                          type="checkbox"
                          checked={pokemon.moved}
                          onChange={(event) =>
                            persistUpdate(pokemon.id, { moved: event.target.checked })
                          }
                        />
                      </td>
                      <td>{pokemon.specialties.join(', ') || '—'}</td>
                      <td>{pokemon.idealHabitat || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="step-card" aria-labelledby="step-4-heading">
        <p className="step-label">Step 4</p>
        <h2 id="step-4-heading">My assigned Pokémon groups</h2>
        {!canPlan ? (
          <div className="planner-locked" role="status" aria-live="polite">
            Complete Step 2 to manage your groups.
          </div>
        ) : (
          <>
            <p>
              Assigned to <code>{playerName}</code>: {assignedToCurrentPlayer.length}
            </p>
            <div className="group-create">
              <input
                aria-label="New group name"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Create group (e.g. Bright biome)"
              />
              <select
                aria-label="Parent group"
                value={newGroupParent}
                onChange={(event) => setNewGroupParent(event.target.value)}
              >
                <option value="">No parent</option>
                {playerGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={createPlayerGroup}>
                Create group
              </button>
            </div>
            {assignedToCurrentPlayer.length > 0 ? (
              <div className="group-assignment-list">
                <h3>Assign my Pokémon to groups</h3>
                {assignedToCurrentPlayer.map((pokemon) => (
                  <label key={`grouping-${pokemon.id}`} className="group-assignment-item">
                    <span>{pokemon.name}</span>
                    <select
                      aria-label={`Group for ${pokemon.name}`}
                      value={sessionPlan.pokemonGroupAssignments[pokemon.id] ?? ''}
                      onChange={(event) => assignPokemonToGroup(pokemon.id, event.target.value)}
                    >
                      <option value="">Ungrouped</option>
                      {playerGroups.map((group) => (
                        <option key={`assign-${pokemon.id}-${group.id}`} value={group.id}>
                          {group.parentGroupId
                            ? `Parent: ${playerGroupNameById.get(group.parentGroupId) ?? 'Unknown parent'} - ${group.name}`
                            : group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="group-tree">
              <h3>Grouped view</h3>
              {playerGroups.length === 0 ? (
                <p>No groups yet.</p>
              ) : (
                <ul>
                  {(playerGroupChildrenByParent.get('') ?? []).map((rootGroup) =>
                    renderGroupBranch(
                      rootGroup,
                      playerGroupChildrenByParent,
                      groupedPokemonByGroup,
                      new Set(),
                    ),
                  )}
                </ul>
              )}
              {ungroupedAssignedPokemon.length > 0 ? (
                <>
                  <h4>Ungrouped</h4>
                  <ul>
                    {ungroupedAssignedPokemon.map((pokemon) => (
                      <li key={`ungrouped-${pokemon.id}`}>{pokemon.name}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default App
