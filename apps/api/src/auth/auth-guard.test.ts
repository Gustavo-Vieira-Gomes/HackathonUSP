import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { createAppFromModule } from '../app';
import { AppModule } from '../app.module';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

// Rota sem @AllowAnonymous(): deve nascer protegida pelo guard global.
@Controller('guard-probe')
class GuardProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [AppModule.register(loadEnv())],
  controllers: [GuardProbeController],
})
class GuardProbeModule {}

let app: INestApplication;
let url: string;
const emails: string[] = [];
before(async () => {
  app = await createAppFromModule(GuardProbeModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
after(async () => {
  await app
    .get(PrismaService)
    .user.deleteMany({ where: { email: { in: emails } } });
  await app.close();
});

test('C22 - rota sem @AllowAnonymous responde 401 sem cookie e 200 com cookie', async () => {
  assert.equal((await fetch(`${url}/api/guard-probe`)).status, 401);

  const env = loadEnv();
  const email = `guard-${Date.now()}@teste.local`;
  emails.push(email);
  const signUp = await fetch(`${url}/api/sign-up/paciente`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: env.WEB_ORIGIN },
    body: JSON.stringify({ name: 'Guard', email, password: '12345678' }),
  });
  assert.equal(signUp.status, 200);
  const cookie = signUp.headers
    .getSetCookie()
    .map((line) => line.split(';')[0] ?? '')
    .find((pair) => pair.includes('session_token='));
  assert.ok(cookie);
  const response = await fetch(`${url}/api/guard-probe`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
