import '@testing-library/jest-dom'

// Provide a simple localStorage mock if the environment doesn't provide one
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (n) => Object.keys(store)[n] ?? null,
  }
})()

// Only install the mock if localStorage is not functional
try {
  window.localStorage.setItem('__test__', '1')
  window.localStorage.removeItem('__test__')
} catch {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
}
