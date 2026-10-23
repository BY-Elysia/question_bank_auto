import { startHttpApp } from '../../shared/http/bootstrap.js';
import { ControlApiModule } from './control-api.module.js';

await startHttpApp(ControlApiModule, Number(process.env.PORT ?? 5002));
