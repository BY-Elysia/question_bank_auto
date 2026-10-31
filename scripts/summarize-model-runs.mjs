// Index local traces without copying model source text into the summary.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? process.env.LIVE_WORKSPACE_ROOT ?? 'workspace');
const records = [];
for (const book of await fs.readdir(path.join(root, 'books'))) {
  const runs = path.join(root, 'books', book, 'runs');
  let jobs;
  try {
    jobs = await fs.readdir(runs);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  for (const job of jobs)
    for (const name of await fs.readdir(path.join(runs, job))) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(runs, job, name),
        record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!record.at) continue;
      records.push({
        file: path.relative(root, file),
        skill: record.skill,
        version: record.version,
        instructionHash: record.instructionHash,
        at: record.at,
        attempt: record.attempt,
        durationMs: record.durationMs,
        pages: record.trace?.pages ?? [],
        outputCharacters: record.trace?.rawOutput?.length ?? null,
        validationError: record.validationError ?? null,
        outputFormat: record.outputFormat ?? 'prompt_only',
        completionStatus: record.completionStatus ?? null,
        providerError: record.providerError ?? null,
        hasSemanticFeedback: Boolean(record.trace?.input?.task?.feedback),
        rangeCount: record.trace?.input?.task?.ranges?.length ?? null,
        cachedTokens: record.cache?.cachedTokens ?? 0,
        outputTokens: record.usage?.output_tokens ?? null,
      });
    }
}
records.sort((a, b) => a.at.localeCompare(b.at));
const report = {
  calls: records.length,
  tracedCalls: records.filter((r) => r.outputCharacters !== null).length,
  structuralFailures: records.filter((r) => r.validationError).length,
  providerFailures: records.filter((r) => r.providerError).length,
  incompleteResponses: records.filter((r) => r.completionStatus === 'incomplete').length,
  deadlineFailures: records.filter((r) => r.providerError === 'deadline_exceeded').length,
  semanticRetryCalls: records.filter((r) => r.hasSemanticFeedback).length,
  cachedTokens: records.reduce((n, r) => n + r.cachedTokens, 0),
  records,
};
await fs.writeFile(path.join(root, 'trace-index.json'), JSON.stringify(report, null, 2), {
  mode: 0o600,
});
console.log(
  JSON.stringify({ ...report, records: undefined, index: path.join(root, 'trace-index.json') }),
);
