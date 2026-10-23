import { startHttpApp } from '../../shared/http/bootstrap.js';
import { ModelGatewayModule } from './model-gateway.module.js';

await startHttpApp(ModelGatewayModule, Number(process.env.GATEWAY_PORT ?? 5004));
