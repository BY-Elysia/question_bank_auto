import 'reflect-metadata';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import type { Type } from '@nestjs/common';
import { NotImplementedFilter } from './not-implemented.filter.js';

/** No storage, queue, auth or model adapters are initialized in this skeleton. */
export async function createHttpApp(module: Type<unknown>) {
  const app = await NestFactory.create(module, { logger: false });
  app.useGlobalFilters(new NotImplementedFilter(app.get(HttpAdapterHost)));
  return app;
}

export async function startHttpApp(module: Type<unknown>, port: number) {
  const app = await createHttpApp(module);
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  console.log(
    `Contract skeleton on http://127.0.0.1:${port}; all defined business operations return 501.`,
  );
  return app;
}
