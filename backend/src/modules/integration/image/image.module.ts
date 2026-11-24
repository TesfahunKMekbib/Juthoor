import { Module } from '@nestjs/common';
import { EVIDENCE_SANITIZER } from './evidence-sanitizer.js';
import { SharpEvidenceSanitizer } from './sharp-evidence-sanitizer.js';

@Module({
  providers: [{ provide: EVIDENCE_SANITIZER, useClass: SharpEvidenceSanitizer }],
  exports: [EVIDENCE_SANITIZER],
})
export class ImageModule {}
