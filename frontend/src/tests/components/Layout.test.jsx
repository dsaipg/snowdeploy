/**
 * Tests for Layout component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

import Layout from '../../components/Layout'

const mockUser = { display_name: 'Alice', team_name: 'Analytics Team' }

describe('Layout component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('header', () => {
    it('renders app name in header', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByText('SQL Deployment Portal')).toBeInTheDocument()
    })

    it('renders user display name', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })

    it('renders team name badge', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByText('Analytics Team')).toBeInTheDocument()
    })

    it('renders Sign out button', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })

    it('calls onLogout when Sign out clicked', async () => {
      const user = userEvent.setup()
      const onLogout = vi.fn()
      render(
        <Layout user={mockUser} onLogout={onLogout} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )

      await user.click(screen.getByRole('button', { name: /sign out/i }))
      expect(onLogout).toHaveBeenCalledOnce()
    })
  })

  describe('navigation tabs', () => {
    it('renders Files tab', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByRole('button', { name: /files/i })).toBeInTheDocument()
    })

    it('renders Editor tab', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument()
    })

    it('renders Promote tab', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument()
    })

    it('renders History tab', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    })

    it('renders all 4 tabs', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div>content</div>
        </Layout>
      )
      const nav = screen.getByRole('navigation')
      const buttons = nav.querySelectorAll('button')
      expect(buttons).toHaveLength(4)
    })

    it('calls setActiveTab with tab id when tab clicked', async () => {
      const user = userEvent.setup()
      const setActiveTab = vi.fn()
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={setActiveTab}>
          <div>content</div>
        </Layout>
      )

      await user.click(screen.getByRole('button', { name: /editor/i }))
      expect(setActiveTab).toHaveBeenCalledWith('editor')
    })

    it('calls setActiveTab with history when History tab clicked', async () => {
      const user = userEvent.setup()
      const setActiveTab = vi.fn()
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={setActiveTab}>
          <div>content</div>
        </Layout>
      )

      await user.click(screen.getByRole('button', { name: /history/i }))
      expect(setActiveTab).toHaveBeenCalledWith('history')
    })

    it('calls setActiveTab with promote when Promote tab clicked', async () => {
      const user = userEvent.setup()
      const setActiveTab = vi.fn()
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={setActiveTab}>
          <div>content</div>
        </Layout>
      )

      await user.click(screen.getByRole('button', { name: /promote/i }))
      expect(setActiveTab).toHaveBeenCalledWith('promote')
    })
  })

  describe('children rendering', () => {
    it('renders children content', () => {
      render(
        <Layout user={mockUser} onLogout={vi.fn()} activeTab="files" setActiveTab={vi.fn()}>
          <div data-testid="child-content">Hello World</div>
        </Layout>
      )
      expect(screen.getByTestId('child-content')).toBeInTheDocument()
      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })
})
