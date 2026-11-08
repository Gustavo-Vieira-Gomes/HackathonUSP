import { type SessionUser } from '@hackathon/contracts';
import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage as Request } from 'node:http';
import { AuthSessionService } from './auth-session.service';

@Controller('me')
export class MeController {
  constructor(private readonly sessions: AuthSessionService) {}

  @Get()
  async me(@Req() req: Request): Promise<SessionUser> {
    const session = await this.sessions.getSession(req.headers);
    if (!session) throw new UnauthorizedException();
    return session.user;
  }
}
