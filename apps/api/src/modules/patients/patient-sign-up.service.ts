import type { IncomingHttpHeaders } from 'node:http';
import type { PatientSignUpBody } from '@hackathon/contracts';
import { Injectable } from '@nestjs/common';
import { SignUpService } from '../../auth/sign-up.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../clock/clock.service';

@Injectable()
export class PatientSignUpService {
  constructor(
    private readonly signUps: SignUpService,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async signUp(body: PatientSignUpBody, headers: IncomingHttpHeaders) {
    const account = await this.signUps.signUp(
      'paciente',
      {
        name: body.name,
        email: body.email,
        password: body.password,
      },
      headers,
    );
    try {
      await this.prisma.patient.create({
        data: {
          userId: account.body.user.id,
          phone: body.phone,
          healthDataConsentAt: this.clock.now(),
        },
      });
    } catch (error) {
      await this.prisma.user.delete({ where: { id: account.body.user.id } });
      throw error;
    }
    return account;
  }
}
