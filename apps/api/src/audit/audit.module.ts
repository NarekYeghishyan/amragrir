import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global, like `PrismaModule`, and for the same reason: almost every module that
 * changes something has to record that it did. Making each one import this would
 * be ceremony that a module could quietly skip — and a module that skips it is a
 * module whose changes leave no trace.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
