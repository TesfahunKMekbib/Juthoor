import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditEntry, AuditEntrySchema } from './audit-entry.schema.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: AuditEntry.name, schema: AuditEntrySchema }])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
