import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { AuthSessionService } from '../../auth/auth-session.service';
import { PatientsService } from './patients.service';

@Controller('patient/subscriptions')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Get(':id')
  async subscription(@Param('id') id: string, @Req() request: IncomingMessage) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException();
    const session = await this.sessions.getSession(request.headers);
    if (!session) throw new UnauthorizedException();
    return this.patients.subscription(session.user, id);
  }
}
