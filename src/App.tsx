import { useEffect, useMemo, useState } from 'react'
import csvBaseline from '../pokopia_assignment - Sheet1.csv?raw'
import {
  applySessionOverrides,
  createNextSessionPlanRecord,
  parsePokemonCsv,
  type PlanUpdate,
  type SessionPlanRecord,
} from './planner'
import {
  normalizePlayerName,
  resolvePlayerName,
  resolveSessionId,
  setPlayerName as persistPlayerName,
} from './session'
import { loadSessionPlan, saveSessionPlan } from './sessionDb'
import './App.css'

const CHANNEL_PREFIX = 'pokopia-coop-sync:'

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now().toString(36)}`
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
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('All')

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
  const showPlayerPrompt = playerName.length === 0

  useEffect(() => {
    let isActive = true

    void loadSessionPlan(sessionId)
      .then((stored) => {
        if (!isActive || !stored) {
          return
        }

        setSessionPlan((current) => (stored.updatedAt > current.updatedAt ? stored : current))
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
      const next = event.data
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

  const confirmPlayerName = (rawValue: string, allowExisting = false) => {
    const normalized = normalizePlayerName(rawValue)
    if (!normalized) {
      return
    }

    if (
      !allowExisting &&
      !playerName &&
      knownPlayers.some((name) => name.toLowerCase() === normalized.toLowerCase())
    ) {
      setPendingExistingPlayer(
        knownPlayers.find((name) => name.toLowerCase() === normalized.toLowerCase()) ?? normalized,
      )
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

  return (
    <main className="app">
      <header className="header">
        <h1>Pokopia Cooperative Planner</h1>
        <p>CSV defines the Pokémon baseline. Session DB stores only owner + moved planning decisions per group.</p>
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
        </div>
      </header>

      {showPlayerPrompt ? (
        <section className="player-prompt" aria-label="Join session">
          <h2>Join this session</h2>
          <p>Enter your player name so assignments can be tracked by session + player.</p>
          <div className="player-controls">
            <input
              aria-label="Player name"
              value={playerInput}
              onChange={(event) => setPlayerInput(event.target.value)}
              placeholder="Your name"
            />
            <button type="button" onClick={() => confirmPlayerName(playerInput)}>
              Continue
            </button>
          </div>
          {pendingExistingPlayer ? (
            <div className="existing-player-choice">
              <p>
                "{pendingExistingPlayer}" already exists in this session. Join that player or use a new
                name.
              </p>
              <button type="button" onClick={() => confirmPlayerName(pendingExistingPlayer, true)}>
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
    </main>
  )
}

export default App
