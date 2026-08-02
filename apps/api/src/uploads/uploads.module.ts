import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { MAX_IMAGE_UPLOAD_BYTES } from '@amragrir/shared';
import { collectRawBody } from './raw-body.middleware';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Slack over the ceiling, so the limit is enforced where it can be explained.
 *
 * The middleware stops *keeping* bytes past this; the service is what turns
 * that into a 413 with a message. Draining a little beyond the real limit is
 * what buys the difference between an answer and a dropped connection.
 */
const DRAIN_LIMIT_BYTES = MAX_IMAGE_UPLOAD_BYTES + 64 * 1024;

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Scoped to this controller and no further: every other route in the API
    // takes JSON, and a global raw-body reader would consume bodies the
    // ValidationPipe expects to parse.
    consumer.apply(collectRawBody(DRAIN_LIMIT_BYTES)).forRoutes(UploadsController);
  }
}
