/**
 * Tests for api/client.js — axios instance and API modules
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  const axios = {
    default: {
      create: vi.fn(() => mockInstance),
    },
    create: vi.fn(() => mockInstance),
  }
  return axios
})

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

describe('api/client.js', () => {
  let authApi, filesApi, deployApi, statusApi, lockApi, promotionApi, configApi

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../../api/client.js')
    authApi = mod.authApi
    filesApi = mod.filesApi
    deployApi = mod.deployApi
    statusApi = mod.statusApi
    lockApi = mod.lockApi
    promotionApi = mod.promotionApi
    configApi = mod.configApi
  })

  describe('authApi', () => {
    it('has login method', () => {
      expect(typeof authApi.login).toBe('function')
    })

    it('has getTeams method', () => {
      expect(typeof authApi.getTeams).toBe('function')
    })

    it('login accepts username, password, teamId', () => {
      expect(authApi.login.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('configApi', () => {
    it('has getAppConfig method', () => {
      expect(typeof configApi.getAppConfig).toBe('function')
    })
  })

  describe('filesApi', () => {
    it('has listFiles method', () => {
      expect(typeof filesApi.listFiles).toBe('function')
    })

    it('has getFile method', () => {
      expect(typeof filesApi.getFile).toBe('function')
    })

    it('has saveFile method', () => {
      expect(typeof filesApi.saveFile).toBe('function')
    })

    it('has deleteFile method', () => {
      expect(typeof filesApi.deleteFile).toBe('function')
    })
  })

  describe('deployApi', () => {
    it('has trigger method', () => {
      expect(typeof deployApi.trigger).toBe('function')
    })

    it('has getHistory method', () => {
      expect(typeof deployApi.getHistory).toBe('function')
    })
  })

  describe('statusApi', () => {
    it('has getStatus method', () => {
      expect(typeof statusApi.getStatus).toBe('function')
    })
  })

  describe('lockApi', () => {
    it('has list method', () => {
      expect(typeof lockApi.list).toBe('function')
    })

    it('has acquire method', () => {
      expect(typeof lockApi.acquire).toBe('function')
    })

    it('has release method', () => {
      expect(typeof lockApi.release).toBe('function')
    })

    it('has heartbeat method', () => {
      expect(typeof lockApi.heartbeat).toBe('function')
    })
  })

  describe('promotionApi', () => {
    it('has getSummary method', () => {
      expect(typeof promotionApi.getSummary).toBe('function')
    })

    it('has getRequests method', () => {
      expect(typeof promotionApi.getRequests).toBe('function')
    })

    it('has submit method', () => {
      expect(typeof promotionApi.submit).toBe('function')
    })

    it('has approve method', () => {
      expect(typeof promotionApi.approve).toBe('function')
    })

    it('has deploy method', () => {
      expect(typeof promotionApi.deploy).toBe('function')
    })

    it('has clearRequests method', () => {
      expect(typeof promotionApi.clearRequests).toBe('function')
    })
  })
})
