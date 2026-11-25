import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { uploadLimits } from '../../../libs/common/config/app-config.js';
import { CurrentParticipant, type ParticipantContext } from '../../../libs/common/identity/participant.js';
import type { PhotoToStore } from '../../../libs/integration/storage/photo-storage.js';
import { ActivitiesService } from './activities.service.js';
import { UploadErrorsInterceptor } from './upload-errors.interceptor.js';

const PHOTO_FIELD = 'photos';
const MAX_KEY_LENGTH = 100;

/** A file as multer (memory storage) hands it over. */
interface UploadedFile extends PhotoToStore {
  fieldname: string;
}

interface StatusReply {
  status(code: number): unknown;
}

/**
 * Participant endpoints for activities (FR-009-012, FR-015, FR-017). Every route needs a participant (global
 * guard); the owner always comes from `@CurrentParticipant()`, never from the body or headers (NFR-025).
 */
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  /** Submit an activity: multipart `data` JSON + `photos`; 201 when created, 200 on a replay (FR-015). */
  @Post()
  @UseInterceptors(
    UploadErrorsInterceptor,
    FilesInterceptor(PHOTO_FIELD, uploadLimits(process.env).files, { limits: uploadLimits(process.env) }),
  )
  async create(
    @CurrentParticipant() participant: ParticipantContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { data?: unknown } | undefined,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Res({ passthrough: true }) reply: StatusReply,
  ) {
    const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!key)
      throw new BadRequestException({
        code: 'request.idempotencyKeyMissing',
        message: 'The Idempotency-Key header is required.',
      });
    if (key.length > MAX_KEY_LENGTH)
      throw new BadRequestException({ code: 'request.malformed', message: 'The Idempotency-Key header is too long.' });

    const data = typeof body?.data === 'string' ? body.data : undefined;
    const photos = (files ?? []).filter((f) => f.fieldname === PHOTO_FIELD);
    const { created, activity } = await this.activities.submit(participant.participantId, data, photos, key);
    reply.status(created ? 201 : 200);
    return activity;
  }

  /** The caller's own submissions, newest first (FR-017). */
  @Get()
  async list(@CurrentParticipant() participant: ParticipantContext, @Query('status') status?: string) {
    return { items: await this.activities.listForUser(participant.participantId, status) };
  }

  @Get(':id')
  get(@CurrentParticipant() participant: ParticipantContext, @Param('id') id: string) {
    return this.activities.getForUser(participant.participantId, id);
  }

  /** Evidence photos are private: only the owner may read them (NFR-009, NFR-025). */
  @Get(':id/photos/:photoId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(
    @CurrentParticipant() participant: ParticipantContext,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const { buffer, mimeType } = await this.activities.getPhotoForUser(participant.participantId, id, photoId);
    return new StreamableFile(buffer, { type: mimeType });
  }
}
