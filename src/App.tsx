import { useEffect, useMemo, useState } from 'react'
import csvBaseline from '../pokopia_assignment - Sheet1.csv?raw'
import {
  applySessionOverrides,
  parsePokemonCsv,
  type Owner,
  type PlanUpdate,
  type SessionPlanRecord,
  upsertOverride,
} from './planner'
import { resolveSessionId } from './session'
import { loadSessionPlan, saveSessionPlan } from './sessionDb'
import './App.css'

const CHANNEL_PREFIX = 'pokopia-coop-sync:'

function App() {
  const [sessionId] = useState(resolveSessionId)
  const [sessionPlan, setSessionPlan] = useState<SessionPlanRecord>({
    sessionId,
    updatedAt: 0,
    overrides: {},
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<'All' | Owner>('All')

  const baselinePokemon = useMemo(() => parsePokemonCsv(csvBaseline), [])

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

  const plannedPokemon = useMemo(
    () => applySessionOverrides(baselinePokemon, sessionPlan.overrides),
    [baselinePokemon, sessionPlan.overrides],
  )

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
      const next: SessionPlanRecord = {
        sessionId,
        updatedAt: current.updatedAt + 1,
        overrides: upsertOverride(current.overrides, pokemonId, update),
      }

      void saveSessionPlan(next)

      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${sessionId}`)
        channel.postMessage(next)
        channel.close()
      }

      return next
    })
  }

  return (
    <main className="app">
      <header className="header">
        <h1>Pokopia Cooperative Planner</h1>
        <p>CSV defines the Pokémon baseline. Session DB stores only owner + moved planning decisions per group.</p>
        <p>
          Session: <code>{sessionId}</code>
        </p>
      </header>

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
            onChange={(event) => setOwnerFilter(event.target.value as 'All' | Owner)}
          >
            <option value="All">All</option>
            <option value="Thomas">Thomas</option>
            <option value="Daniel">Daniel</option>
            <option value="Shared">Shared</option>
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
                    onChange={(event) =>
                      persistUpdate(pokemon.id, { owner: event.target.value as Owner })
                    }
                  >
                    <option value="Thomas">Thomas</option>
                    <option value="Daniel">Daniel</option>
                    <option value="Shared">Shared</option>
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
