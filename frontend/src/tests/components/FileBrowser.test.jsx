/**
 * Tests for FileBrowser component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

vi.mock('../../api/client', () => ({
  filesApi: {
    listFiles: vi.fn(),
    getFile: vi.fn(),
    saveFile: vi.fn(),
    deleteFile: vi.fn(),
  },
  lockApi: {
    list: vi.fn(),
    acquire: vi.fn(),
    release: vi.fn(),
    heartbeat: vi.fn(),
  },
}))

import FileBrowser from '../../components/FileBrowser'
import { filesApi, lockApi } from '../../api/client'

const sampleFiles = [
  {
    path: 'views/user_view.sql',
    name: 'user_view.sql',
    subfolder: 'views',
    size_bytes: 512,
    last_modified: '2024-01-15T10:30:00Z',
    last_commit_message: 'Add user view',
  },
  {
    path: 'alter_ddls/add_column.sql',
    name: 'add_column.sql',
    subfolder: 'alter_ddls',
    size_bytes: 256,
    last_modified: '2024-01-14T09:00:00Z',
    last_commit_message: 'Add column migration',
  },
  {
    path: 'schema_table_ddls/bronze/users.sql',
    name: 'users.sql',
    subfolder: 'schema_table_ddls/bronze',
    size_bytes: 1024,
    last_modified: '2024-01-13T08:00:00Z',
    last_commit_message: 'Create users table',
  },
]

describe('FileBrowser component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    filesApi.listFiles.mockResolvedValue({ data: { files: sampleFiles } })
    lockApi.list.mockResolvedValue({ data: [] })
  })

  describe('initial render', () => {
    it('shows loading state initially', () => {
      filesApi.listFiles.mockReturnValue(new Promise(() => {}))
      lockApi.list.mockReturnValue(new Promise(() => {}))
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      expect(screen.getByText('Loading…')).toBeInTheDocument()
    })

    it('renders SQL Files heading', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('SQL Files')).toBeInTheDocument()
      })
    })

    it('renders New File button', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new file/i })).toBeInTheDocument()
      })
    })

    it('calls onNewFile when New File button clicked', async () => {
      const user = userEvent.setup()
      const onNewFile = vi.fn()
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={onNewFile} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new file/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /new file/i }))
      expect(onNewFile).toHaveBeenCalled()
    })
  })

  describe('folder tree', () => {
    it('renders folder tree sidebar after loading', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('FOLDERS')).toBeInTheDocument()
      })
    })

    it('renders views folder', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })
    })

    it('renders alter_ddls folder', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('alter_ddls')).toBeInTheDocument()
      })
    })

    it('renders procedures folder', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('procedures')).toBeInTheDocument()
      })
    })

    it('renders schema_table_ddls group header', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)
      await waitFor(() => {
        expect(screen.getByText('schema_table_ddls')).toBeInTheDocument()
      })
    })
  })

  describe('file list after folder selection', () => {
    it('shows file name after clicking views folder', async () => {
      const user = userEvent.setup()
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })

      await user.click(screen.getByText('views'))

      await waitFor(() => {
        expect(screen.getByText('user_view.sql')).toBeInTheDocument()
      })
    })

    it('shows Open button for files', async () => {
      const user = userEvent.setup()
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })

      await user.click(screen.getByText('views'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^open$/i })).toBeInTheDocument()
      })
    })

    it('calls onOpenFile when Open button clicked', async () => {
      const user = userEvent.setup()
      const onOpenFile = vi.fn()
      render(<FileBrowser onOpenFile={onOpenFile} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })

      await user.click(screen.getByText('views'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^open$/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /^open$/i }))
      expect(onOpenFile).toHaveBeenCalledWith('views/user_view.sql')
    })
  })

  describe('search filter', () => {
    it('renders search input in file pane', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Filter files…')).toBeInTheDocument()
      })
    })

    it('filters files by search term', async () => {
      const user = userEvent.setup()
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })

      // Click views folder first to see files
      await user.click(screen.getByText('views'))

      await waitFor(() => {
        expect(screen.getByText('user_view.sql')).toBeInTheDocument()
      })

      // Now search for something that doesn't match
      await user.type(screen.getByPlaceholderText('Filter files…'), 'xyz')

      await waitFor(() => {
        expect(screen.queryByText('user_view.sql')).not.toBeInTheDocument()
      })
    })

    it('shows no match message when search returns nothing', async () => {
      const user = userEvent.setup()
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('views')).toBeInTheDocument()
      })

      await user.click(screen.getByText('views'))

      await waitFor(() => {
        expect(screen.getByText('user_view.sql')).toBeInTheDocument()
      })

      await user.type(screen.getByPlaceholderText('Filter files…'), 'xyz123')

      await waitFor(() => {
        expect(screen.getByText(/no files matching/i)).toBeInTheDocument()
      })
    })
  })

  describe('empty state', () => {
    it('shows empty state when no files', async () => {
      filesApi.listFiles.mockResolvedValue({ data: { files: [] } })
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('No SQL files yet.')).toBeInTheDocument()
      })
    })
  })

  describe('error state', () => {
    it('shows error message when API fails', async () => {
      filesApi.listFiles.mockRejectedValue(new Error('Network error'))
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load files.')).toBeInTheDocument()
      })
    })
  })

  describe('total file count', () => {
    it('shows total file count', async () => {
      render(<FileBrowser onOpenFile={vi.fn()} onNewFile={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('3 total files')).toBeInTheDocument()
      })
    })
  })
})
