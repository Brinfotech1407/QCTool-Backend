import { PrismaClient, RuleType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  const wtParameter = await prisma.testParameter.findFirst({
    where: { name: 'WT Value' }  // change to WT parameter name
  });

  if (!wtParameter) {
    throw new Error('WT Parameter not found');
  }

  await prisma.ruleDefinition.create({
    data: {
      parameterId: wtParameter.id,
      ruleType: RuleType.BAND_MATRIX,
      ruleConfig: {
        rows: [
          { key: "R2", min: 0.40, max: 0.60 }
        ],
        columns: [
          { key: "C2", min: 3.0, max: 16.0 }
        ],
        matrix: [
          { row: "R2", col: "C2", tolerance: 0.05 }
        ]
      }
    }
  });

  console.log('WT Rule inserted');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
