import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditData, type RecordedAudit } from './audit';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * A client that can write — the real one, or a transaction.
 *
 * Typed as the transaction client because that is the narrower of the two:
 * `PrismaService` satisfies it, so a caller may pass either, and one that passes
 * `tx` gets the guarantee that matters.
 */
export type AuditClient = Prisma.TransactionClient;

/**
 * Recording what staff did.
 *
 * `record` takes the client rather than reaching for `this.prisma` so the entry
 * can be written **inside the transaction that made the change**. That is not a
 * stylistic preference: a log written after the fact is a log with gaps in it
 * exactly when something failed halfway, which is precisely when it is read.
 * Callers that are not already in a transaction should open one rather than pass
 * the bare client — see `MenuService.create`.
 *
 * There is no `list` here. Reading is `StaffActivityService`, which merges this
 * table with `order_events` and applies the caller's reach; keeping the reader
 * out of the writer means nothing can accidentally read unscoped.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(client: AuditClient, staff: StaffJwtPayload, entry: RecordedAudit): Promise<void> {
    await client.auditLog.create({ data: auditData(staff, entry) });
  }

  /**
   * The same, for an action that genuinely has no transaction to join.
   *
   * `staff.impersonate` is the only one: issuing a token is not a database
   * write, so there is nothing to be atomic with. Separate method rather than a
   * default argument, so that reaching for it is a decision somebody made rather
   * than the path of least resistance.
   */
  async recordStandalone(staff: StaffJwtPayload, entry: RecordedAudit): Promise<void> {
    await this.record(this.prisma, staff, entry);
  }
}
