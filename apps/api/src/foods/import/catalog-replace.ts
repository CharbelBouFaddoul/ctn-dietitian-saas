import type { PrismaClient } from "@prisma/client";

/** Remove catalog rows for a source so a newer dump can replace them. Practice custom foods are untouched. */
export async function replaceCatalogFoods(prisma: PrismaClient, sourceKey: string): Promise<number> {
  const source = await prisma.foodSource.findUnique({ where: { key: sourceKey } });
  if (!source) return 0;
  const catalog = { foodSourceId: source.id, dietitianAccountId: null };
  await prisma.foodOverride.deleteMany({ where: { food: catalog } });
  await prisma.mealItem.deleteMany({ where: { food: catalog } });
  await prisma.foodLog.updateMany({ where: { food: catalog }, data: { foodId: null } });
  await prisma.recipeIngredient.deleteMany({ where: { food: catalog } });
  const deleted = await prisma.food.deleteMany({ where: catalog });
  return deleted.count;
}
