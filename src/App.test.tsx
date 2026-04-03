import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadSessionPlan, saveSessionPlan } from './sessionDb'

vi.mock('./session', () => ({
  resolveSessionId: () => 'group-a',
}))

vi.mock('./sessionDb', () => ({
  loadSessionPlan: vi.fn(async () => null),
  saveSessionPlan: vi.fn(async () => undefined),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads session data from DB and persists only planning overrides', async () => {
    const user = userEvent.setup()

    vi.mocked(loadSessionPlan).mockResolvedValueOnce({
      sessionId: 'group-a',
      updatedAt: 20,
      overrides: {
        '#001-Bulbasaur-0': { owner: 'Shared' },
      },
    })

    render(<App />)

    expect(screen.getByText(/Session:/i)).toBeInTheDocument()
    expect(screen.getByText('group-a')).toBeInTheDocument()

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
        '#001-Bulbasaur-0': expect.objectContaining({ owner: 'Shared', moved: true }),
      }),
    )

    expect(JSON.stringify(savedRecord)).not.toContain('"name":"Bulbasaur"')
    expect(JSON.stringify(savedRecord)).not.toContain('"specialties"')
  })
})
