import type { SessionPlanRecord } from './planner'

const DB_NAME = 'pokopia-coop-db'
const STORE_NAME = 'session_plans'
const DB_VERSION = 1
const FALLBACK_PREFIX = 'pokopia-coop-db:'

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadSessionPlan(sessionId: string): Promise<SessionPlanRecord | null> {
  if (!supportsIndexedDb()) {
    const fallback = localStorage.getItem(`${FALLBACK_PREFIX}${sessionId}`)
    return fallback ? (JSON.parse(fallback) as SessionPlanRecord) : null
  }

  const db = await openDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(sessionId)
    let result: SessionPlanRecord | null = null

    request.onsuccess = () => {
      result = (request.result as SessionPlanRecord | undefined) ?? null
    }
    transaction.oncomplete = () => {
      db.close()
      resolve(result)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function saveSessionPlan(record: SessionPlanRecord): Promise<void> {
  if (!supportsIndexedDb()) {
    localStorage.setItem(`${FALLBACK_PREFIX}${record.sessionId}`, JSON.stringify(record))
    return
  }

  const db = await openDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}
