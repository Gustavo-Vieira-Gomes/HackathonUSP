import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from './env';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: AppEnv): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_ENV, useValue: env }],
      exports: [APP_ENV],
    };
  }
}
