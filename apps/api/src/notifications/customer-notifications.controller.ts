import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, RequiresVerifiedPhone } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { ListNotificationsDto } from './dto';

/**
 * The customer's bell.
 *
 * Gated on a verified phone, like `GET /orders` and for the same reason: every
 * notification here is about an order, and ordering is what verification gates
 * (ROLES_AND_PERMISSIONS.md §1). A guest session has nothing to be told about,
 * so the endpoint would answer an empty list — and answering it at all would
 * mean a per-device account accumulating a bell nobody can carry to their next
 * device.
 *
 * Separate controller from `NotificationsController` (the back office's bell)
 * because the two share no route prefix, no guard and no reader: staff carry a
 * different token, are addressed by branch rather than by account, and read a
 * different table. See DATABASE.md §8b for why the tables are not one table.
 */
@Controller('notifications')
@RequiresVerifiedPhone()
export class CustomerNotificationsController {
  constructor(private readonly notifications: CustomerNotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user.sub, query.limit);
  }

  /**
   * Marks one notification read — what tapping a line in the bell does, because
   * that is the gesture that means "I have seen this one".
   */
  @Patch(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  /**
   * Clears the badge in one call, which is what opening the panel means.
   *
   * A POST rather than a PATCH per id: the alternative is thirty requests to
   * say one thing, and the set being cleared is "everything unread" rather than
   * a list the client has to hold and send back.
   */
  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  /**
   * Throws one away — the cross on a line.
   *
   * A real `DELETE` rather than a flag, because the row genuinely goes: the
   * fact it describes is in `orders` and `order_events` either way, so there is
   * nothing here worth keeping that is not kept somewhere better. See the
   * service.
   */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.remove(user.sub, id);
  }

  /**
   * Empties the bell.
   *
   * `DELETE` on the collection rather than a `POST /clear`, unlike `read-all`
   * above: marking read is a state change with no HTTP verb of its own, while
   * removing every member of a collection is exactly what this verb means.
   */
  @Delete()
  @HttpCode(200)
  removeAll(@CurrentUser() user: JwtPayload) {
    return this.notifications.removeAll(user.sub);
  }
}
