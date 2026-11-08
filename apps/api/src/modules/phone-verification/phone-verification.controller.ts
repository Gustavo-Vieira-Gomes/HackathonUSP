import {
  type PhoneVerificationSentResponse,
  type PhoneVerifiedResponse,
  phoneVerificationConfirmBodySchema,
} from '@hackathon/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { IncomingMessage as Request } from 'node:http';
import { AuthSessionService } from '../../auth/auth-session.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Verificação do telefone do paciente logado (HACK-37). O telefone vem do cadastro
 * do paciente, nunca do corpo: não dá para verificar o número de outra pessoa.
 */
@Controller('me/phone/verification')
export class PhoneVerificationController {
  constructor(
    private readonly sessions: AuthSessionService,
    private readonly prisma: PrismaService,
    private readonly verification: PhoneVerificationService,
  ) {}

  @Post()
  @HttpCode(200)
  async send(@Req() req: Request): Promise<PhoneVerificationSentResponse> {
    const patientId = await this.patientOf(req);
    const { expiresAt } = await this.verification.sendCode(patientId);
    return { expiresAt: expiresAt.toISOString() };
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<PhoneVerifiedResponse> {
    const patientId = await this.patientOf(req);
    const parsed = phoneVerificationConfirmBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_BODY',
        message: 'Corpo inválido: envie apenas code, com 6 dígitos.',
      });
    }
    const { phoneVerifiedAt } = await this.verification.confirm(
      patientId,
      parsed.data.code,
    );
    return { phoneVerifiedAt: phoneVerifiedAt.toISOString() };
  }

  private async patientOf(req: Request): Promise<string> {
    const session = await this.sessions.getSession(req.headers);
    if (!session) throw new UnauthorizedException();
    if (session.user.role !== 'paciente') throw new ForbiddenException();
    const patient = await this.prisma.patient.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!patient)
      throw new NotFoundException('Perfil de paciente não encontrado.');
    return patient.id;
  }
}
