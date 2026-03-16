/**
 * Tests for Login component
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock config
vi.mock('../../config', () => ({
  default: {
    apiBaseUrl: '/api',
    appName: 'SQL Deployment Portal',
    authMode: 'mock',
    statusPollInterval: 3000,
    historyLimit: 10,
    theme: 'dark',
    oauthRedirectUri: 'http://localhost/auth/callback',
  },
}))

// Mock api/client
vi.mock('../../api/client', () => ({
  authApi: {
    login: vi.fn(),
    getTeams: vi.fn(),
  },
}))

import Login from '../../components/Login'
import { authApi } from '../../api/client'

describe('Login component', () => {
  beforeEach(() => {
    // Clear localStorage items used by Login
    localStorage.removeItem('sql_portal_token')
    localStorage.removeItem('sql_portal_user')
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.removeItem('sql_portal_token')
    localStorage.removeItem('sql_portal_user')
  })

  describe('basic render', () => {
    it('renders the app name heading', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText('SQL Deployment Portal')).toBeInTheDocument()
    })

    it('renders the subtitle', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText('Self-service SQL deployment portal')).toBeInTheDocument()
    })

    it('renders username input', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByPlaceholderText('e.g. alice')).toBeInTheDocument()
    })

    it('renders password input', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    })

    it('renders Sign In button', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('shows dev mode hint in mock auth mode', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText(/dev mode/i)).toBeInTheDocument()
    })
  })

  describe('form submission', () => {
    it('calls authApi.login with entered credentials', async () => {
      const user = userEvent.setup()
      authApi.login.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          user: { display_name: 'Alice', team_name: 'Team A' },
        },
      })
      const onLogin = vi.fn()
      render(<Login onLogin={onLogin} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'alice')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith('alice', 'password', null)
      })
    })

    it('calls onLogin with user data on success', async () => {
      const user = userEvent.setup()
      const mockUser = { display_name: 'Alice', team_name: 'Team A' }
      authApi.login.mockResolvedValueOnce({
        data: { access_token: 'test-token', user: mockUser },
      })
      const onLogin = vi.fn()
      render(<Login onLogin={onLogin} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'alice')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(onLogin).toHaveBeenCalledWith(mockUser)
      })
    })

    it('stores token in localStorage on success', async () => {
      const user = userEvent.setup()
      authApi.login.mockResolvedValueOnce({
        data: {
          access_token: 'test-token-123',
          user: { display_name: 'Alice', team_name: 'Team A' },
        },
      })
      render(<Login onLogin={vi.fn()} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'alice')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(localStorage.getItem('sql_portal_token')).toBe('test-token-123')
      })
    })

    it('shows error message on failed login', async () => {
      const user = userEvent.setup()
      authApi.login.mockRejectedValueOnce({
        response: { data: { detail: 'Invalid credentials' } },
      })
      render(<Login onLogin={vi.fn()} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'baduser')
      await user.type(screen.getByPlaceholderText('••••••••'), 'badpass')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })
    })

    it('shows fallback error message when no detail in response', async () => {
      const user = userEvent.setup()
      authApi.login.mockRejectedValueOnce(new Error('Network error'))
      render(<Login onLogin={vi.fn()} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'alice')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument()
      })
    })

    it('disables button and shows loading text while submitting', async () => {
      const user = userEvent.setup()
      let resolveLogin
      authApi.login.mockReturnValueOnce(new Promise(resolve => { resolveLogin = resolve }))
      render(<Login onLogin={vi.fn()} />)

      await user.type(screen.getByPlaceholderText('e.g. alice'), 'alice')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Signing in…')).toBeInTheDocument()
      })

      // Clean up
      resolveLogin({ data: { access_token: 't', user: {} } })
    })
  })

  describe('returning user card', () => {
    const storedUser = { display_name: 'Alice', team_name: 'Analytics Team' }

    beforeEach(() => {
      localStorage.setItem('sql_portal_user', JSON.stringify(storedUser))
      localStorage.setItem('sql_portal_token', 'existing-token')
    })

    it('shows returning user name', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    it('shows returning user team', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText('Analytics Team')).toBeInTheDocument()
    })

    it('shows Sign in button', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    })

    it('calls onLogin with stored user when Sign in clicked', async () => {
      const user = userEvent.setup()
      const onLogin = vi.fn()
      render(<Login onLogin={onLogin} />)

      await user.click(screen.getByRole('button', { name: /^sign in$/i }))

      expect(onLogin).toHaveBeenCalledWith(storedUser)
    })

    it('shows "Not you? Sign in differently" button', () => {
      render(<Login onLogin={vi.fn()} />)
      expect(screen.getByText(/not you/i)).toBeInTheDocument()
    })

    it('switches to full login form when "Not you" clicked', async () => {
      const user = userEvent.setup()
      render(<Login onLogin={vi.fn()} />)

      await user.click(screen.getByText(/not you/i))

      expect(screen.getByPlaceholderText('e.g. alice')).toBeInTheDocument()
    })
  })
})
