/**
 * Tests for SqlEditor component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Monaco Editor with a simple textarea
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={e => onChange && onChange(e.target.value)}
    />
  ),
}))

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
    acquire: vi.fn().mockResolvedValue({}),
    release: vi.fn().mockResolvedValue({}),
    heartbeat: vi.fn().mockResolvedValue({}),
  },
}))

import SqlEditor from '../../components/SqlEditor'
import { filesApi, lockApi } from '../../api/client'

describe('SqlEditor component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lockApi.acquire.mockResolvedValue({})
    lockApi.release.mockResolvedValue({})
    lockApi.heartbeat.mockResolvedValue({})
  })

  describe('toolbar renders', () => {
    it('renders subfolder select', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('renders filename input', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByPlaceholderText('filename.sql')).toBeInTheDocument()
    })

    it('renders Save button', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })

    it('renders New button', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    it('renders Templates button', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByRole('button', { name: /templates/i })).toBeInTheDocument()
    })

    it('renders commit message input', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByPlaceholderText(/commit message/i)).toBeInTheDocument()
    })

    it('renders the Monaco editor', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })
  })

  describe('subfolder select options', () => {
    it('contains alter_ddls option', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()
      const option = Array.from(select.options).find(o => o.value === 'alter_ddls')
      expect(option).toBeDefined()
    })

    it('contains views option', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      const select = screen.getByRole('combobox')
      const option = Array.from(select.options).find(o => o.value === 'views')
      expect(option).toBeDefined()
    })

    it('contains procedures option', () => {
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)
      const select = screen.getByRole('combobox')
      const option = Array.from(select.options).find(o => o.value === 'procedures')
      expect(option).toBeDefined()
    })
  })

  describe('New button', () => {
    it('clears filename when New clicked', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const filenameInput = screen.getByPlaceholderText('filename.sql')
      // Use fireEvent.change to avoid triggering suggestFilename on focus
      fireEvent.change(filenameInput, { target: { value: 'myfile.sql' } })
      expect(filenameInput.value).toBe('myfile.sql')

      await user.click(screen.getByRole('button', { name: /new/i }))
      expect(filenameInput.value).toBe('')
    })

    it('clears commit message when New clicked', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const commitInput = screen.getByPlaceholderText(/commit message/i)
      // Use fireEvent.change to set value without focus side-effects
      fireEvent.change(commitInput, { target: { value: 'my commit' } })
      expect(commitInput.value).toBe('my commit')

      await user.click(screen.getByRole('button', { name: /new/i }))
      expect(commitInput.value).toBe('')
    })
  })

  describe('template dropdown', () => {
    it('shows templates dropdown when Templates button clicked and templates exist', async () => {
      const user = userEvent.setup()
      const templates = [
        { name: 'CREATE TABLE', description: 'Basic table template', content: 'CREATE TABLE t (id INT);' },
      ]
      render(<SqlEditor initialFile={null} templates={templates} onFileSaved={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /templates/i }))
      await waitFor(() => {
        expect(screen.getByText('CREATE TABLE')).toBeInTheDocument()
      })
    })

    it('does not show templates dropdown when no templates', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /templates/i }))
      expect(screen.queryByRole('button', { name: 'CREATE TABLE' })).not.toBeInTheDocument()
    })
  })

  describe('save functionality', () => {
    it('shows error when saving without filename', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText('Enter a filename before saving.')).toBeInTheDocument()
      })
    })

    it('calls filesApi.saveFile on valid save', async () => {
      const user = userEvent.setup()
      filesApi.saveFile.mockResolvedValueOnce({
        data: { commit_sha: 'abc1234567890' },
      })
      const onFileSaved = vi.fn()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={onFileSaved} />)

      // Use fireEvent.change to avoid focus-triggered suggestFilename behavior
      fireEvent.change(screen.getByPlaceholderText('filename.sql'), { target: { value: 'test.sql' } })
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(filesApi.saveFile).toHaveBeenCalled()
      })
    })

    it('shows success message after save', async () => {
      const user = userEvent.setup()
      filesApi.saveFile.mockResolvedValueOnce({
        data: { commit_sha: 'abc1234567890' },
      })
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      // Use fireEvent.change to avoid focus-triggered suggestFilename behavior
      fireEvent.change(screen.getByPlaceholderText('filename.sql'), { target: { value: 'test.sql' } })
      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText(/saved as/i)).toBeInTheDocument()
      })
    })
  })

  describe('linting — alter_ddls subfolder', () => {
    it('shows lint panel when ALTER TABLE ADD COLUMN without IF NOT EXISTS in alter_ddls', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      // Switch to alter_ddls subfolder
      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      // Type problematic SQL in editor
      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'ALTER TABLE my_table ADD COLUMN my_col VARCHAR(100);' }
      })

      await waitFor(() => {
        expect(screen.getByText(/migration lint/i)).toBeInTheDocument()
      })
    })

    it('shows lint panel for DROP TABLE in alter_ddls', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'DROP TABLE old_table;' }
      })

      await waitFor(() => {
        expect(screen.getByText(/migration lint/i)).toBeInTheDocument()
      })
    })

    it('shows lint panel for TRUNCATE in alter_ddls', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'TRUNCATE TABLE my_table;' }
      })

      await waitFor(() => {
        expect(screen.getByText(/migration lint/i)).toBeInTheDocument()
      })
    })

    it('does NOT show lint panel for safe SQL in alter_ddls', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'SELECT 1;' }
      })

      expect(screen.queryByText(/migration lint/i)).not.toBeInTheDocument()
    })

    it('does NOT show lint panel for views subfolder even with DROP TABLE', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'views')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'DROP TABLE bad_table;' }
      })

      expect(screen.queryByText(/migration lint/i)).not.toBeInTheDocument()
    })

    it('lint panel can be dismissed', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'DROP TABLE old_table;' }
      })

      await waitFor(() => {
        expect(screen.getByText(/migration lint/i)).toBeInTheDocument()
      })

      // Click dismiss button (✕)
      await user.click(screen.getByRole('button', { name: /✕/ }))

      await waitFor(() => {
        expect(screen.queryByText(/migration lint/i)).not.toBeInTheDocument()
      })
    })

    it('shows error severity for DROP TABLE', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'DROP TABLE old_table;' }
      })

      await waitFor(() => {
        const errorBadges = screen.getAllByText('error')
        expect(errorBadges.length).toBeGreaterThan(0)
      })
    })

    it('shows warning severity for DROP COLUMN', async () => {
      const user = userEvent.setup()
      render(<SqlEditor initialFile={null} templates={[]} onFileSaved={vi.fn()} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'alter_ddls')

      const editor = screen.getByTestId('monaco-editor')
      fireEvent.change(editor, {
        target: { value: 'ALTER TABLE my_table DROP COLUMN old_col;' }
      })

      await waitFor(() => {
        const warningBadges = screen.getAllByText('warning')
        expect(warningBadges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('loading a file', () => {
    it('calls filesApi.getFile when initialFile is provided', async () => {
      filesApi.getFile.mockResolvedValueOnce({
        data: { content: 'SELECT * FROM my_table;' },
      })
      render(<SqlEditor initialFile="views/my_view.sql" templates={[]} onFileSaved={vi.fn()} />)

      await waitFor(() => {
        expect(filesApi.getFile).toHaveBeenCalledWith('views/my_view.sql')
      })
    })

    it('sets filename from loaded file path', async () => {
      filesApi.getFile.mockResolvedValueOnce({
        data: { content: 'SELECT 1;' },
      })
      render(<SqlEditor initialFile="views/my_view.sql" templates={[]} onFileSaved={vi.fn()} />)

      await waitFor(() => {
        const filenameInput = screen.getByPlaceholderText('filename.sql')
        expect(filenameInput.value).toBe('my_view.sql')
      })
    })
  })
})
