import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DietitianAccountBackfillService } from "../src/dietitian-accounts/dietitian-account-backfill.service";
import { createAuthTestApp, resetAuthDatabase, type AuthTestContext } from "./app";

describe("DietitianAccount Phase 1 backfill", () => {
  let ctx: AuthTestContext;
  let backfill: DietitianAccountBackfillService;

  beforeAll(async () => {
    ctx = await createAuthTestApp();
    backfill = ctx.app.get(DietitianAccountBackfillService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetAuthDatabase(ctx.prisma);
  });

  async function createUser(email: string, password = "Password1!") {
    const passwordHash = await ctx.passwords.hash(password);
    return ctx.prisma.user.create({
      data: {
        email,
        emailNormalized: email.toLowerCase(),
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        firstName: email.split("@")[0] ?? "User",
        lastName: "Test",
      },
    });
  }

  async function seedLegacyOrgFixture() {
    const owner = await createUser("owner@example.com");
    const dietitian = await createUser("dietitian@example.com");
    const staff = await createUser("staff@example.com");
    const patient = await createUser("patient@example.com");

    const org = await ctx.prisma.organization.create({
      data: {
        name: "Legacy Practice",
        slug: "legacy-practice",
        status: "ACTIVE",
        createdById: owner.id,
      },
    });
    await ctx.prisma.organizationSettings.create({
      data: {
        organizationId: org.id,
        timezone: "UTC",
        locale: "en",
        currency: "USD",
        weightUnit: "kg",
        heightUnit: "cm",
        dateFormat: "YYYY_MM_DD",
        practiceName: "Legacy Practice",
      },
    });

    const ownerMember = await ctx.prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    const dietitianMember = await ctx.prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: dietitian.id,
        role: "DIETITIAN",
        status: "ACTIVE",
      },
    });
    const staffMember = await ctx.prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: staff.id,
        role: "STAFF",
        status: "ACTIVE",
      },
    });

    const plan = await ctx.prisma.plan.findFirst({ where: { slug: "standard" } });
    if (plan) {
      await ctx.prisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });
    }

    const recipe = await ctx.prisma.recipe.create({
      data: {
        organizationId: org.id,
        name: "Owner Recipe",
        status: "ACTIVE",
        servings: 1,
        createdById: owner.id,
      },
    });

    const assignedToDietitian = await ctx.prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Assigned",
        lastName: "Dietitian",
        displayName: "Assigned Dietitian",
        status: "ACTIVE",
        createdById: owner.id,
      },
    });
    await ctx.prisma.clientProfile.create({
      data: { organizationId: org.id, clientId: assignedToDietitian.id },
    });
    await ctx.prisma.clientAssignment.create({
      data: {
        organizationId: org.id,
        clientId: assignedToDietitian.id,
        organizationMemberId: dietitianMember.id,
        assignedById: owner.id,
      },
    });

    const foodSource =
      (await ctx.prisma.foodSource.findFirst({ where: { key: "backfill-test" } })) ??
      (await ctx.prisma.foodSource.create({
        data: {
          key: "backfill-test",
          name: "Backfill Test",
          provider: "Test",
          datasetVersion: "1",
          license: "test",
          attribution: "test",
          importedAt: new Date(),
        },
      }));
    const food = await ctx.prisma.food.create({
      data: {
        foodSourceId: foodSource.id,
        sourceFoodId: `salad-${org.id}`,
        name: "Salad",
        nameNormalized: "salad",
        category: "Vegetables",
        referenceQuantity: 100,
        referenceUnit: "g",
        energyKcal: 50,
        proteinG: 2,
        carbohydrateG: 8,
        fatG: 1,
        fiberG: 2,
        sugarG: 3,
        sodiumMg: 10,
        importedAt: new Date(),
      },
    });
    await ctx.prisma.foodLog.create({
      data: {
        organizationId: org.id,
        clientId: assignedToDietitian.id,
        foodId: food.id,
        trackingDate: new Date("2026-01-15"),
        consumedAt: new Date("2026-01-15T12:00:00Z"),
        quantity: 1,
        unit: "g",
        nutritionSnapshot: {
          energyKcal: 50,
          proteinG: 2,
          carbohydrateG: 8,
          fatG: 1,
        },
        status: "ACTIVE",
      },
    });

    const assignedToStaff = await ctx.prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Assigned",
        lastName: "Staff",
        displayName: "Assigned Staff",
        status: "ACTIVE",
        createdById: owner.id,
      },
    });
    await ctx.prisma.clientProfile.create({
      data: { organizationId: org.id, clientId: assignedToStaff.id },
    });
    await ctx.prisma.clientAssignment.create({
      data: {
        organizationId: org.id,
        clientId: assignedToStaff.id,
        organizationMemberId: staffMember.id,
        assignedById: owner.id,
      },
    });

    const unassigned = await ctx.prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Unassigned",
        lastName: "Client",
        displayName: "Unassigned Client",
        status: "ACTIVE",
        createdById: owner.id,
      },
    });
    await ctx.prisma.clientProfile.create({
      data: { organizationId: org.id, clientId: unassigned.id },
    });

    const patientClient = await ctx.prisma.client.create({
      data: {
        organizationId: org.id,
        firstName: "Portal",
        lastName: "Patient",
        displayName: "Portal Patient",
        status: "ACTIVE",
        createdById: owner.id,
      },
    });
    await ctx.prisma.clientProfile.create({
      data: { organizationId: org.id, clientId: patientClient.id },
    });
    await ctx.prisma.clientAssignment.create({
      data: {
        organizationId: org.id,
        clientId: patientClient.id,
        organizationMemberId: ownerMember.id,
        assignedById: owner.id,
      },
    });
    await ctx.prisma.clientAccount.create({
      data: {
        userId: patient.id,
        clientId: patientClient.id,
        organizationId: org.id,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    await ctx.prisma.appointment.create({
      data: {
        organizationId: org.id,
        clientId: assignedToDietitian.id,
        title: "Check-in",
        startAt: new Date("2026-02-01T10:00:00Z"),
        endAt: new Date("2026-02-01T11:00:00Z"),
        status: "SCHEDULED",
        assignedMemberId: dietitianMember.id,
        createdById: owner.id,
      },
    });

    await ctx.prisma.task.create({
      data: {
        organizationId: org.id,
        clientId: assignedToDietitian.id,
        title: "Follow up",
        status: "TODO",
        priority: "NORMAL",
        assignedMemberId: dietitianMember.id,
        createdById: owner.id,
      },
    });

    return {
      org,
      owner,
      dietitian,
      staff,
      patient,
      ownerMember,
      dietitianMember,
      staffMember,
      assignedToDietitian,
      assignedToStaff,
      unassigned,
      patientClient,
      recipe,
    };
  }

  it("backfills OWNER/DIETITIAN accounts and maps clients/clinical data (1B)", async () => {
    const fixture = await seedLegacyOrgFixture();

    const summary = await backfill.run();
    expect(summary.accountsCreated).toBe(2);
    expect(summary.clientsUpdated).toBeGreaterThanOrEqual(4);

    const ownerAccount = await ctx.prisma.dietitianAccount.findUnique({
      where: { id: fixture.org.id },
    });
    expect(ownerAccount?.userId).toBe(fixture.owner.id);
    expect(ownerAccount?.legacyOrganizationId).toBe(fixture.org.id);

    const dietitianAccount = await ctx.prisma.dietitianAccount.findUnique({
      where: { userId: fixture.dietitian.id },
    });
    expect(dietitianAccount).toBeTruthy();
    expect(dietitianAccount!.id).not.toBe(fixture.org.id);

    const staffAccount = await ctx.prisma.dietitianAccount.findUnique({
      where: { userId: fixture.staff.id },
    });
    expect(staffAccount).toBeNull();

    const assignedDietitianClient = await ctx.prisma.client.findUniqueOrThrow({
      where: { id: fixture.assignedToDietitian.id },
    });
    expect(assignedDietitianClient.dietitianAccountId).toBe(dietitianAccount!.id);

    const foodLog = await ctx.prisma.foodLog.findFirst({
      where: { clientId: fixture.assignedToDietitian.id },
    });
    expect(foodLog?.dietitianAccountId).toBe(dietitianAccount!.id);
    expect(foodLog?.foodId).toBeTruthy();

    const staffClient = await ctx.prisma.client.findUniqueOrThrow({
      where: { id: fixture.assignedToStaff.id },
    });
    expect(staffClient.dietitianAccountId).toBe(ownerAccount!.id);

    const unassigned = await ctx.prisma.client.findUniqueOrThrow({
      where: { id: fixture.unassigned.id },
    });
    expect(unassigned.dietitianAccountId).toBe(ownerAccount!.id);

    const patientAccount = await ctx.prisma.clientAccount.findUniqueOrThrow({
      where: { clientId: fixture.patientClient.id },
    });
    expect(patientAccount.dietitianAccountId).toBe(ownerAccount!.id);

    const recipe = await ctx.prisma.recipe.findUniqueOrThrow({
      where: { id: fixture.recipe.id },
    });
    expect(recipe.dietitianAccountId).toBe(ownerAccount!.id);

    if (await ctx.prisma.plan.findFirst({ where: { slug: "standard" } })) {
      const subscription = await ctx.prisma.subscription.findUnique({
        where: { dietitianAccountId: ownerAccount!.id },
      });
      expect(subscription?.status).toBe("ACTIVE");
    }

    const appointment = await ctx.prisma.appointment.findFirst({
      where: { clientId: fixture.assignedToDietitian.id },
    });
    expect(appointment?.assignedUserId).toBe(fixture.dietitian.id);
    expect(appointment?.dietitianAccountId).toBe(dietitianAccount!.id);

    const task = await ctx.prisma.task.findFirst({
      where: { clientId: fixture.assignedToDietitian.id },
    });
    expect(task?.assignedUserId).toBe(fixture.dietitian.id);

    // Legacy org rows remain
    const legacyOrg = await ctx.prisma.organization.findUnique({ where: { id: fixture.org.id } });
    expect(legacyOrg).toBeTruthy();
    expect(await ctx.prisma.organizationMember.count({ where: { organizationId: fixture.org.id } })).toBe(3);
  });

  it("is idempotent on a second run", async () => {
    await seedLegacyOrgFixture();
    const first = await backfill.run();
    const second = await backfill.run();
    expect(first.accountsCreated).toBe(2);
    expect(second.accountsCreated).toBe(0);
    expect(second.accountsReused).toBeGreaterThanOrEqual(2);
    expect(await ctx.prisma.dietitianAccount.count()).toBe(2);
  });

  it("fails preflight when a user has multiple ACTIVE OWNER/DIETITIAN memberships", async () => {
    const user = await createUser("multi@example.com");
    const orgA = await ctx.prisma.organization.create({
      data: { name: "A", slug: "org-a", status: "ACTIVE", createdById: user.id },
    });
    const orgB = await ctx.prisma.organization.create({
      data: { name: "B", slug: "org-b", status: "ACTIVE", createdById: user.id },
    });
    await ctx.prisma.organizationMember.create({
      data: { organizationId: orgA.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
    });
    await ctx.prisma.organizationMember.create({
      data: { organizationId: orgB.id, userId: user.id, role: "DIETITIAN", status: "ACTIVE" },
    });

    await expect(backfill.run()).rejects.toThrow(/>1 ACTIVE OWNER\/DIETITIAN membership/i);
  });
});
