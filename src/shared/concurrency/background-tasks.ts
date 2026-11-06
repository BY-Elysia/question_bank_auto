/** Execution lifetime only. Durable statuses/checkpoints belong to the use case. */
export class BackgroundTasks {
  private tasks = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  has(id: string) {
    return this.tasks.has(id);
  }
  start(id: string, execute: (signal: AbortSignal) => Promise<void>) {
    if (this.has(id)) throw new Error('Task is already running');
    const abort = new AbortController();
    const promise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => execute(abort.signal))
      .finally(() => this.tasks.delete(id));
    this.tasks.set(id, { abort, promise });
    // Keep the rejection observable through wait(), without an unhandled rejection
    // if a caller has left the page. Business failures are persisted by execute().
    void promise.catch((error) => console.error('Background task persistence failed', error));
  }
  async cancel(id: string, reason?: unknown) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.abort.abort(reason);
    await task.promise;
    return true;
  }
  async wait(id: string) {
    await this.tasks.get(id)?.promise;
  }
  async shutdown(reason?: unknown) {
    const tasks = [...this.tasks.values()];
    for (const task of tasks) task.abort.abort(reason);
    await Promise.allSettled(tasks.map((task) => task.promise));
  }
}
