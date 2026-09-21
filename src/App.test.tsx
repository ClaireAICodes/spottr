import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'

describe('Spottr application shell', () => {
  it('exposes five named tabs with Home selected', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: /primary/i })
    const tabs = screen.getAllByRole('tab')

    expect(navigation).toBeInTheDocument()
    expect(tabs).toHaveLength(5)
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Home'),
      expect.stringContaining('Train'),
      expect.stringContaining('Plan'),
      expect.stringContaining('Progress'),
      expect.stringContaining('Profile'),
    ])
    expect(screen.getByRole('tab', { name: /home/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves selection and focus with arrow keys', async () => {
    const user = userEvent.setup()
    render(<App />)

    const home = screen.getByRole('tab', { name: /home/i })
    await user.click(home)
    await user.keyboard('{ArrowRight}')

    const train = screen.getByRole('tab', { name: /train/i })
    expect(train).toHaveFocus()
    expect(train).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument()
  })

  it('renders presentation-only empty and resume frames on Home', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /ready when you are/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /resume your session/i })).toBeInTheDocument()
    expect(screen.getByText(/preview only/i)).toBeInTheDocument()
  })
})
