import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders planner and allows cooperative owner updates', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByRole('heading', { name: /pokopia cooperative planner/i })).toBeInTheDocument()

    const bulbasaurOwnerSelect = screen.getByLabelText('Owner for Bulbasaur')
    await user.selectOptions(bulbasaurOwnerSelect, 'Shared')

    expect((bulbasaurOwnerSelect as HTMLSelectElement).value).toBe('Shared')

    const persisted = localStorage.getItem('pokopia-coop-plan-v1')
    expect(persisted).toContain('"name":"Bulbasaur"')
    expect(persisted).toContain('"owner":"Shared"')
  })
})
