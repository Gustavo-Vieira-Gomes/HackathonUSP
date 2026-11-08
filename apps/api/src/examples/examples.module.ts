import { Module } from '@nestjs/common';
import { ExampleJob } from './example.job';

@Module({ providers: [ExampleJob] })
export class ExamplesModule {}
