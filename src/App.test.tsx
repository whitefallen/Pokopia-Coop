import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  normalizePlayerName,
  resolvePlayerName,
  setPlayerName,
} from './session'
import { loadSessionPlan, saveSessionPlan } from './sessionDb'

vi.mock('./session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session')>()
  return {
    ...actual,
    resolveSessionId: vi.fn(() => 'group-a'),
    resolvePlayerName: vi.fn(() => 'Ash'),
    normalizePlayerName: vi.fn((value: string) => actual.normalizePlayerName(value)),
    setPlayerName: vi.fn(),
  }
})

vi.mock('./sessionDb', () => ({
  loadSessionPlan: vi.fn(async () => null),
  saveSessionPlan: vi.fn(async () => undefined),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    cleanup()
  })

  it('loads session data from DB and persists only planning overrides', async () => {
    const user = userEvent.setup()

    vi.mocked(loadSessionPlan).mockResolvedValueOnce({
      sessionId: 'group-a',
      updatedAt: 20,
      overrides: {
        '#001|Bulbasaur': { owner: '' },
      },
      groups: {},
      pokemonGroupAssignments: {},
    })

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Co-op assignment' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shared planner workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Shareable session link')).toBeInTheDocument()
    expect(screen.getByText(/Session:/i)).toBeInTheDocument()
    expect(screen.getByText('group-a')).toBeInTheDocument()
    expect(screen.getByText(/You are planning as/i)).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Step 2 co-op assignment')).getByText('Ash', { selector: 'code' }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Owner for Bulbasaur')).toHaveValue('')
    })

    const bulbasaurMoved = screen.getByLabelText('Moved status for Bulbasaur')
    await user.click(bulbasaurMoved)

    expect(saveSessionPlan).toHaveBeenCalled()
    const savedRecord = vi.mocked(saveSessionPlan).mock.calls.at(-1)?.[0]
    expect(savedRecord?.sessionId).toBe('group-a')
    expect(savedRecord?.overrides).toEqual(
      expect.objectContaining({
        '#001|Bulbasaur': expect.objectContaining({ owner: '', moved: true }),
      }),
    )

    expect(JSON.stringify(savedRecord)).not.toContain('"name":"Bulbasaur"')
    expect(JSON.stringify(savedRecord)).not.toContain('"specialties"')
  })

  it('creates share links from the current host origin', () => {
    vi.mocked(resolvePlayerName).mockReturnValue('')
    window.history.replaceState({}, '', '/planner?session=group-a&player=Ash')

    render(<App />)

    expect(screen.getByLabelText('Shareable session link')).toHaveValue(
      `${window.location.origin}/planner?session=group-a`,
    )
  })

  it('asks for name and supports joining an existing player identity', async () => {
    const user = userEvent.setup()

    vi.mocked(resolvePlayerName).mockReturnValue('')
    vi.mocked(loadSessionPlan).mockResolvedValueOnce({
      sessionId: 'group-a',
      updatedAt: 20,
      overrides: {
        '#001|Bulbasaur': { owner: 'Misty' },
      },
      groups: {},
      pokemonGroupAssignments: {},
    })

    render(<App />)

    expect(screen.getByText(/Complete Step 2 to start planning in this session\./i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Player name'), '  Misty  ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      screen.getByText(/already exists in this session\. Join that player or use a new name\./i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join as Misty' }))

    expect(normalizePlayerName).toHaveBeenCalledWith('  Misty  ')
    expect(setPlayerName).toHaveBeenCalledWith('group-a', 'Misty')
    expect(screen.getByText(/You are planning as/i)).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Step 2 co-op assignment')).getByText('Misty', {
        selector: 'code',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Complete Step 2 to start planning in this session\./i)).not.toBeInTheDocument()
  })

  it('shows assigned list and allows creating nested player groups', async () => {
    const user = userEvent.setup()
    vi.mocked(resolvePlayerName).mockReturnValue('Ash')

    vi.mocked(loadSessionPlan).mockResolvedValueOnce({
      sessionId: 'group-a',
      updatedAt: 20,
      overrides: {
        '#001|Bulbasaur': { owner: 'Ash' },
      },
      groups: {},
      pokemonGroupAssignments: {},
    })

    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText((_, element) =>
          element?.textContent?.replace(/\s+/g, ' ').trim() === 'Assigned to Ash: 1',
        ),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('New group name'), 'Bright biome')
    await user.click(screen.getByRole('button', { name: 'Create group' }))

    expect(saveSessionPlan).toHaveBeenCalled()
    expect(screen.getAllByText('Bright biome').length).toBeGreaterThan(0)

    const bulbasaurGroupSelect = screen.getByLabelText('Group for Bulbasaur') as HTMLSelectElement
    await user.selectOptions(bulbasaurGroupSelect, bulbasaurGroupSelect.options[1])
    expect(saveSessionPlan).toHaveBeenCalled()
  })
})
