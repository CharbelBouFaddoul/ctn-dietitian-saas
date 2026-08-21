import request from "supertest";
import { DEMO_EMAILS, demoPassword, seedDemoWorld, type DemoWorld } from "../../src/demo";
import {
  cookieValue,
  createAuthTestApp,
  resetAuthDatabase,
  type AuthTestContext,
} from "../app";

export type DemoAcceptanceContext = AuthTestContext & {
  world: DemoWorld;
};

export async function seedAcceptanceWorld(ctx: AuthTestContext): Promise<DemoWorld> {
  await resetAuthDatabase(ctx.prisma);
  return seedDemoWorld(ctx.prisma, {
    catalog: "sample",
    password: demoPassword(),
    skipAi: process.env.AI_ENABLED !== "true",
  });
}

export async function loginAs(
  ctx: AuthTestContext,
  email: string,
  password = demoPassword(),
): Promise<string> {
  const login = await request(ctx.app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password })
    .expect(200);
  return `ns_session=${cookieValue(login.headers["set-cookie"])}`;
}

export async function createDemoAcceptanceContext(): Promise<DemoAcceptanceContext> {
  const ctx = await createAuthTestApp();
  const world = await seedAcceptanceWorld(ctx);
  return { ...ctx, world };
}

export { DEMO_EMAILS, demoPassword };
