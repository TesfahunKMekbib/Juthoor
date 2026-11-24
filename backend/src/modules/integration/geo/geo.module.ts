import { Module } from '@nestjs/common';
import { DatasetGeoBoundaryProvider } from './dataset-geo-boundary-provider.js';
import { GEO_BOUNDARY_PROVIDER } from './geo-boundary-provider.js';

@Module({
  providers: [{ provide: GEO_BOUNDARY_PROVIDER, useFactory: () => new DatasetGeoBoundaryProvider() }],
  exports: [GEO_BOUNDARY_PROVIDER],
})
export class GeoModule {}
