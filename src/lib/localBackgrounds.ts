const DATABASE_NAME = 'livegallery-backgrounds'
const STORE_NAME = 'backgrounds'
const MAX_BYTES = 8 * 1024 * 1024
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

interface StoredBackground { id: string; name: string; blob: Blob; createdAt: number }
export interface LocalBackground { id: string; name: string; url: string }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Không thể mở bộ nhớ nền.'))
  })
}

async function runStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Không thể cập nhật nền.'))
    transaction.oncomplete = () => database.close()
  })
}

const toBackground = (item: StoredBackground): LocalBackground => ({ id: item.id, name: item.name, url: URL.createObjectURL(item.blob) })

export async function loadLocalBackgrounds() {
  const items = await runStore<StoredBackground[]>('readonly', (store) => store.getAll())
  return items.sort((a, b) => b.createdAt - a.createdAt).map(toBackground)
}

export async function saveLocalBackground(file: File) {
  if (!TYPES.has(file.type)) throw new Error('Nền chỉ nhận PNG, JPG hoặc WebP.')
  if (file.size > MAX_BYTES) throw new Error('Ảnh nền phải nhỏ hơn 8 MB.')
  const item: StoredBackground = {
    id: `local-${crypto.randomUUID()}`,
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'Nền của tôi',
    blob: file,
    createdAt: Date.now(),
  }
  await runStore('readwrite', (store) => store.add(item))
  return toBackground(item)
}

export async function deleteLocalBackground(id: string) {
  await runStore('readwrite', (store) => store.delete(id))
}
