const listeners = new Set<() => void>();

export function subscribeTaskChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyTaskChanges(): void {
  for (const listener of listeners) listener();
}
