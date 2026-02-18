import { PrismaClient, RuleType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  const odParameter = await prisma.testParameter.findFirst({
    where: { name: 'OD Value' }
  });

  if (!odParameter) {
    throw new Error('OD Parameter not found');
  }

  await prisma.ruleDefinition.create({
    data: {
      parameterId: odParameter.id,
      ruleType: RuleType.BAND_SINGLE,
      ruleConfig: {
        bands: [
          { min: 0.8, max: 3.0, tolerance: 0.05 },
          { min: 3.0, max: 16.0, tolerance: 0.05 },
          { min: 16.0, max: 50.0, tolerance: 0.08 }
        ]
      }
    }
  });

  console.log('OD Rule inserted');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
