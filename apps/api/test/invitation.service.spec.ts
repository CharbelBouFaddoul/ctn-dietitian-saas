import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InvalidInvitationTokenError } from "../src/auth/invitation.service";
import { createAuthTestApp, resetAuthDatabase, type AuthTestContext } from "./app";

describe("invitation tokens", () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
  });

  beforeEach(async () => {
    await resetAuthDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx?.app.close();
  });

  it("generates a hashed token that is single-use and expiring", async () => {
    const created = await ctx.invitations.create({
      purpose: "STAFF_INVITE",
      emailNormalized: "staff@example.com",
    });

    expect(created.rawToken.length).toBeGreaterThan(20);
    expect(created.invitation.tokenHash).not.toBe(created.rawToken);
    expect(created.invitation.tokenHash).toBe(ctx.tokens.hashToken(created.rawToken));
    expect(created.invitation.purpose).toBe("STAFF_INVITE");

    const validated = await ctx.invitations.validate(created.rawToken);
    expect(validated.id).toBe(created.invitation.id);

    const consumed = await ctx.invitations.consume(created.rawToken);
    expect(consumed.usedAt).not.toBeNull();

    await expect(ctx.invitations.consume(created.rawToken)).rejects.toBeInstanceOf(
      InvalidInvitationTokenError,
    );

    const expired = await ctx.invitations.create({
      purpose: "CLIENT_INVITE",
      ttlSeconds: 1,
    });
    await ctx.prisma.invitationToken.update({
      where: { id: expired.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(ctx.invitations.validate(expired.rawToken)).rejects.toBeInstanceOf(
      InvalidInvitationTokenError,
    );
  });
});
