const lockName = 'spottr-workout-gym-integrity'
let fallbackQueue: Promise<void> = Promise.resolve()

export async function withWorkoutIntegrityLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(lockName, operation)
  }

  const previous = fallbackQueue
  let release: () => void = () => undefined
  fallbackQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}
