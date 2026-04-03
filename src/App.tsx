import { useEffect, useMemo, useState } from 'react'
import csvBaseline from '../pokopia_assignment - Sheet1.csv?raw'
import {
  createPlannerState,
  type Owner,
  type PlanUpdate,
  type PlannerState,
  updatePlannerState,
} from './planner'
import './App.css'

const STORAGE_KEY = 'pokopia-coop-plan-v1'
const CHANNEL_NAME = 'pokopia-coop-sync'

function loadState(): PlannerState {
  const baseline = createPlannerState(csvBaseline)

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return baseline
    }

    const parsed = JSON.parse(stored) as PlannerState
    if (!Array.isArray(parsed.pokemon)) {
      return baseline
    }

    return parsed
  } catch {
    return baseline
  }
}

function App() {
  const [state, setState] = useState<PlannerState>(() => loadState())
  const [searchTerm, setSearchTerm] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<'All' | Owner>('All')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return
      }

      try {
        const next = JSON.parse(event.newValue) as PlannerState
        setState((current) => (next.updatedAt > current.updatedAt ? next : current))
      } catch {
        // ignore invalid synced payloads
      }
    }

    const handleMessage = (event: MessageEvent<PlannerState>) => {
      const next = event.data
      if (next?.updatedAt) {
        setState((current) => (next.updatedAt > current.updatedAt ? next : current))
      }
    }

    window.addEventListener('storage', handleStorage)
    channel?.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      channel?.removeEventListener('message', handleMessage)
      channel?.close()
    }
  }, [])

  const visiblePokemon = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return state.pokemon.filter((pokemon) => {
      const ownerMatch = ownerFilter === 'All' || pokemon.owner === ownerFilter
      const searchMatch =
        normalizedSearch.length === 0 ||
        pokemon.name.toLowerCase().includes(normalizedSearch) ||
        pokemon.number.toLowerCase().includes(normalizedSearch)

      return ownerMatch && searchMatch
    })
  }, [ownerFilter, searchTerm, state.pokemon])

  const movedCount = useMemo(
    () => state.pokemon.filter((pokemon) => pokemon.moved).length,
    [state.pokemon],
  )

  const syncUpdate = (pokemonNumber: string, update: PlanUpdate) => {
    setState((current) => {
      const next = updatePlannerState(current, pokemonNumber, update)
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(CHANNEL_NAME)
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
        <p>Plan assignments collaboratively from the shared CSV baseline with live sync across open sessions.</p>
      </header>

      <section className="stats" aria-label="Planner summary">
        <span>Total Pokémon: {state.pokemon.length}</span>
        <span>Moved: {movedCount}</span>
        <span>Pending: {state.pokemon.length - movedCount}</span>
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
            {visiblePokemon.map((pokemon, index) => (
              <tr key={`${pokemon.number}-${pokemon.name}-${index}`}>
                <td>{pokemon.number}</td>
                <td>{pokemon.name}</td>
                <td>
                  <select
                    aria-label={`Owner for ${pokemon.name}`}
                    value={pokemon.owner}
                    onChange={(event) =>
                      syncUpdate(pokemon.number, { owner: event.target.value as Owner })
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
                      syncUpdate(pokemon.number, { moved: event.target.checked })
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
