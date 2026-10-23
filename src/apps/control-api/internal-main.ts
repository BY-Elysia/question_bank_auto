import { startHttpApp } from '../../shared/http/bootstrap.js';
import { InternalApiModule } from './internal-api.module.js';

await startHttpApp(InternalApiModule, Number(process.env.INTERNAL_PORT ?? 5003));
