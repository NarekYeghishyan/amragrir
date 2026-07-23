import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Public, RequiresVerifiedPhone } from '../auth/decorators';
import { Idempotent } from '../common/idempotency/idempotency.decorator';
import type { JwtPayload } from '../auth/token.service';
import { ReservationsService } from './reservations.service';
import { AvailabilityQueryDto, CreateReservationDto, ListReservationsDto } from './dto';

@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  /** Public, like the rest of the catalog: a visitor may see free times before
   *  deciding to sign in. */
  @Get('restaurants/:id/availability')
  @Public()
  availability(@Param('id') id: string, @Query() query: AvailabilityQueryDto) {
    return this.reservations.availability(id, query);
  }

  @Post('reservations')
  @RequiresVerifiedPhone()
  @Idempotent('reservations.create')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.sub, dto);
  }

  @Get('reservations')
  @RequiresVerifiedPhone()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListReservationsDto) {
    return this.reservations.list(user.sub, query);
  }

  @Get('reservations/:id')
  @RequiresVerifiedPhone()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.findOne(user.sub, id);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  @RequiresVerifiedPhone()
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.cancel(user.sub, id);
  }
}
