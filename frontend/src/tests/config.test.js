/**
 * Tests for config.js — verifies defaults and structure
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('config defaults', () => {
  let config

  beforeEach(async () => {
    vi.resetModules()
    // import.meta.env is stubbed to empty in jsdom; defaults should apply
    config = (await import('../config.js')).default
  })

  it('has apiBaseUrl defaulting to /api', () => {
    expect(config.apiBaseUrl).toBe('/api')
  })

  it('has appName defaulting to SQL Deployment Portal', () => {
    expect(config.appName).toBe('SQL Deployment Portal')
  })

  it('has authMode defaulting to mock', () => {
    expect(config.authMode).toBe('mock')
  })

  it('has statusPollInterval as a number', () => {
    expect(typeof config.statusPollInterval).toBe('number')
    expect(config.statusPollInterval).toBeGreaterThan(0)
  })

  it('has historyLimit as a positive number', () => {
    expect(typeof config.historyLimit).toBe('number')
    expect(config.historyLimit).toBeGreaterThan(0)
  })

  it('has theme property', () => {
    expect(config.theme).toBeDefined()
    expect(typeof config.theme).toBe('string')
  })

  it('has oauthRedirectUri property', () => {
    expect(config.oauthRedirectUri).toBeDefined()
    expect(typeof config.oauthRedirectUri).toBe('string')
  })

  it('has all required keys', () => {
    const required = ['apiBaseUrl', 'appName', 'authMode', 'oauthRedirectUri', 'statusPollInterval', 'historyLimit', 'theme']
    for (const key of required) {
      expect(config).toHaveProperty(key)
    }
  })

  it('statusPollInterval defaults to 3000', () => {
    expect(config.statusPollInterval).toBe(3000)
  })

  it('historyLimit defaults to 10', () => {
    expect(config.historyLimit).toBe(10)
  })

  it('theme defaults to dark', () => {
    expect(config.theme).toBe('dark')
  })
})
