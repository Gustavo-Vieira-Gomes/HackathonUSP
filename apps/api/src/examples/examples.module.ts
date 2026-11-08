import { Module } from '@nestjs/common';
import { ExampleGateway } from './example.gateway';
import { ExampleJob } from './example.job';

@Module({ providers: [ExampleJob, ExampleGateway] })
export class ExamplesModule {}
