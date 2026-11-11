import { Controller, Get, Param } from '@nestjs/common';
import { ActivityTypesService } from './activity-types.service.js';

@Controller('activity-types')
export class ActivityTypesController {
  constructor(private readonly types: ActivityTypesService) {}

  /** Published activity types, with their form questions and rules (FR-009). */
  @Get()
  async list() {
    const types = await this.types.findPublished();
    return types.map(({ _id, __v, ...rest }) => ({ id: String(_id), ...rest }));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const { _id, __v, ...rest } = await this.types.findById(id);
    return { id: String(_id), ...rest };
  }
}
