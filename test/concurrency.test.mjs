import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyedLock } from '../dist/app/shared/concurrency/keyed-lock.js';
import { BackgroundTasks } from '../dist/app/shared/concurrency/background-tasks.js';
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
test('Keyed writes serialize per identity, isolate other identities and recover after failure', async () => {
  const lock = new KeyedLock(),
    blocked = gate(),
    events = [];
  const first = lock.run('a', async () => {
    events.push('a1');
    await blocked.promise;
    throw Error('write failed');
  });
  const rejected = assert.rejects(first, /write failed/);
  const second = lock.run('a', async () => {
    events.push('a2');
    return 42;
  });
  await lock.run('b', async () => events.push('b'));
  assert.deepEqual(events, ['a1', 'b']);
  blocked.resolve();
  await rejected;
  assert.equal(await second, 42);
  assert.deepEqual(events, ['a1', 'b', 'a2']);
});
test('Background tasks isolate cancellation, reject duplicates, await cleanup and propagate shutdown reason', async () => {
  const tasks = new BackgroundTasks(),
    started = gate(),
    other = gate(),
    cleaned = [];
  tasks.start('a', async (signal) => {
    started.resolve();
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    cleaned.push(signal.reason);
  });
  tasks.start('b', async (signal) => {
    await other.promise;
    assert.equal(signal.aborted, false);
  });
  assert.throws(() => tasks.start('a', async () => {}), /already running/);
  await started.promise;
  await tasks.cancel('a', 'cancel');
  assert.deepEqual(cleaned, ['cancel']);
  assert.equal(tasks.has('a'), false);
  assert.equal(tasks.has('b'), true);
  const done = tasks.wait('b');
  other.resolve();
  await done;
  tasks.start('c', async (signal) => {
    assert.equal(signal.reason, 'shutdown');
  });
  await tasks.shutdown('shutdown');
  assert.equal(tasks.has('c'), false);
});
