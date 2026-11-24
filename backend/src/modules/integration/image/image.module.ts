import { Module } from '@nestjs/common';
import { IMAGE_PREPARER } from '../ai/image-prep.js';
import { EVIDENCE_SANITIZER } from './evidence-sanitizer.js';
import { SharpEvidenceSanitizer } from './sharp-evidence-sanitizer.js';
import { SharpImagePreparer } from './sharp-image-preparer.js';

@Module({
  providers: [
    { provide: EVIDENCE_SANITIZER, useClass: SharpEvidenceSanitizer },
    { provide: IMAGE_PREPARER, useClass: SharpImagePreparer },
  ],
  exports: [EVIDENCE_SANITIZER, IMAGE_PREPARER],
})
export class ImageModule {}
