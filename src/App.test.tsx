import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
        '#001|Bulbasaur': { owner: 'Shared' },
      },
    })

    render(<App />)

    expect(screen.getByText(/Session:/i)).toBeInTheDocument()
    expect(screen.getByText('group-a')).toBeInTheDocument()
    expect(screen.getByText(/You are planning as/i)).toBeInTheDocument()
    expect(screen.getByText('Ash', { selector: 'code' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText('Owner for Bulbasaur')).toHaveValue('Shared')
    })

    const bulbasaurMoved = screen.getByLabelText('Moved status for Bulbasaur')
    await user.click(bulbasaurMoved)

    expect(saveSessionPlan).toHaveBeenCalled()
    const savedRecord = vi.mocked(saveSessionPlan).mock.calls.at(-1)?.[0]
    expect(savedRecord?.sessionId).toBe('group-a')
    expect(savedRecord?.overrides).toEqual(
      expect.objectContaining({
        '#001|Bulbasaur': expect.objectContaining({ owner: 'Shared', moved: true }),
      }),
    )

    expect(JSON.stringify(savedRecord)).not.toContain('"name":"Bulbasaur"')
    expect(JSON.stringify(savedRecord)).not.toContain('"specialties"')
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
    })

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Join this session' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Player name'), '  Misty  ')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      screen.getByText(/already exists in this session\. Join that player or use a new name\./i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join as Misty' }))

    expect(normalizePlayerName).toHaveBeenCalledWith('  Misty  ')
    expect(setPlayerName).toHaveBeenCalledWith('group-a', 'Misty')
    expect(screen.getByText(/You are planning as/i)).toBeInTheDocument()
    expect(screen.getByText('Misty', { selector: 'code' })).toBeInTheDocument()
  })
})
