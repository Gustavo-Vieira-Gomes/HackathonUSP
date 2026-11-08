import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type Patient,
  type SignIn,
  signInInputSchema,
} from '@hackathon/contracts';
import type { ApiRequest, ApiResponse } from '../../common/http';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './login-throttler.guard';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  async signIn(
    @Body(new ZodValidationPipe(signInInputSchema)) credentials: SignIn,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<Patient> {
    const { patient, setCookies } = await this.auth.signIn(credentials);
    response.append('Set-Cookie', setCookies);
    return patient;
  }

  @Delete('current')
  @HttpCode(204)
  async signOut(
    @Req() request: ApiRequest,
    @Res({ passthrough: true }) response: ApiResponse,
  ): Promise<void> {
    response.append(
      'Set-Cookie',
      await this.auth.signOut(request.headers.cookie),
    );
  }
}
