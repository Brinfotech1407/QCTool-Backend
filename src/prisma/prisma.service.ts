import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit
{
  private getSafeDbTarget() {
    const rawUrl = process.env.DATABASE_URL;

    if (!rawUrl) {
      return 'DATABASE_URL is not set';
    }

    try {
      const parsed = new URL(rawUrl);
      const user = parsed.username || 'unknown-user';
      const host = parsed.hostname || 'unknown-host';
      const port = parsed.port || '5432';
      const dbName = parsed.pathname?.replace('/', '') || 'unknown-db';
      return `user=${user}, host=${host}, port=${port}, database=${dbName}`;
    } catch {
      return 'DATABASE_URL is present but could not be parsed';
    }
  }

  async onModuleInit() {
    const safeTarget = this.getSafeDbTarget();
    console.log(`[Prisma] Connecting to ${safeTarget}`);

    try {
      await this.$connect();
      console.log('[Prisma] Database connection established');
    } catch (error: any) {
      const errorCode = error?.errorCode || error?.code;
      const message = error?.message || 'Unknown Prisma initialization error';

      console.error(`[Prisma] Connection failed (${safeTarget})`);

      if (errorCode === 'P1000') {
        console.error(
          '[Prisma] P1000 Authentication failed. Verify DATABASE_URL username/password and DB grants.',
        );
      }

      throw new Error(`[Prisma Init Error] ${message}`);
    }
  }
}
