import {
  Body,
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
import { Permission } from '@amragrir/shared';
import { CurrentStaff, RequiresPermission, StaffRoute } from '../staff/decorators';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { StaffDirectoryService } from '../staff/staff-directory.service';
import { ListTeamDto } from '../staff/dto';
import { RestaurantOrdersService } from './orders.service';
import { MenuService } from './menu.service';
import { MenuSectionsService } from './menu-sections.service';
import { MenuHistoryService } from './menu-history.service';
import { RestaurantReservationsService } from './reservations.service';
import { BookingSettingsService } from './booking-settings.service';
import {
  BookingPreviewDto,
  CreateClosureDto,
  ForceDto,
  SetBookingHoursDto,
  SetReservationTableDto,
  TableDto,
  UpdateBookingPolicyDto,
  UpdateTableDto,
  isForced,
} from './booking-settings.dto';
import { ListStaffReservationsDto, SetReservationStatusDto } from '../reservations/dto';
import { ListQueueDto, SetOrderReminderDto, SetOrderStatusDto } from './dto';
import {
  CreateBranchDto,
  CreateMenuItemDto,
  CreateMenuSectionDto,
  ListMenuItemsDto,
  ListMenuSectionsDto,
  ListRestaurantsDto,
  SetAvailabilityDto,
  SetBranchBookingsDto,
  SetBranchCoverDto,
  SetBranchServicesDto,
  SetBranchStatusDto,
  SetRestaurantCoverDto,
  SetRestaurantServicesDto,
  UpdateBranchDto,
  UpdateMenuItemDto,
  UpdateMenuSectionDto,
} from './menu.dto';

/**
 * The restaurant side of the platform, for whoever holds a role over it.
 *
 * This was `/owner` when "owner" was a role on the customer table. It is now
 * every back-office role from `branch_staff` upwards, so each route names the
 * **permission** it needs rather than a list of roles — and the service applies
 * a scope filter for that same permission, because "may you call this" and
 * "which rows may you touch" are different questions.
 */
@Controller('restaurant')
@StaffRoute()
export class RestaurantController {
  constructor(
    private readonly orders: RestaurantOrdersService,
    private readonly menu: MenuService,
    private readonly sections: MenuSectionsService,
    private readonly menuHistory: MenuHistoryService,
    private readonly reservations: RestaurantReservationsService,
    private readonly bookingSettings: BookingSettingsService,
    // The people query lives with the rest of the reach-scoped people queries
    // rather than being reimplemented here: "you only see your own reach" is
    // that service's whole job, and a second copy of it is a second place for
    // it to be got wrong.
    private readonly directory: StaffDirectoryService,
  ) {}

  @Get('orders')
  @RequiresPermission(Permission.OrdersRead)
  listOrders(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListQueueDto) {
    return this.orders.listOrders(staff, query);
  }

  /**
   * How this order got where it is: placed, paid, and every hand that moved it.
   *
   * `orders:read` rather than `orders:advance` — reading the trail is part of
   * watching the queue, and the counter is often not the person allowed to
   * advance anything.
   */
  @Get('orders/:id/history')
  @RequiresPermission(Permission.OrdersRead)
  orderHistory(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.history(staff, id);
  }

  @Patch('orders/:id/status')
  @RequiresPermission(Permission.OrdersAdvance)
  setStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
  ) {
    return this.orders.setStatus(staff, id, dto);
  }

  /**
   * How much notice the branch wants on a pre-order.
   *
   * `orders:advance` rather than a permission of its own: it moves nothing the
   * customer was promised — the food is still due at the same minute — and the
   * person who should decide how much warning the pass gets is the person
   * working it.
   */
  @Patch('orders/:id/reminder')
  @RequiresPermission(Permission.OrdersAdvance)
  setOrderReminder(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderReminderDto,
  ) {
    return this.orders.setReminderLead(staff, id, dto);
  }

  @Get('reservations')
  @RequiresPermission(Permission.ReservationsRead)
  listReservations(
    @CurrentStaff() staff: StaffJwtPayload,
    @Query() query: ListStaffReservationsDto,
  ) {
    return this.reservations.list(staff, query);
  }

  /**
   * Puts a booking at a different table.
   *
   * `reservations:advance`, the same permission as moving it through its
   * statuses, because it is the same job: the guest is still coming and the
   * deposit is untouched, somebody on the floor has just decided they are
   * better off by the window.
   */
  @Patch('reservations/:id/table')
  @RequiresPermission(Permission.ReservationsAdvance)
  setReservationTable(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReservationTableDto,
  ) {
    return this.reservations.setTable(staff, id, dto);
  }

  @Patch('reservations/:id/status')
  @RequiresPermission(Permission.ReservationsAdvance)
  setReservationStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReservationStatusDto,
  ) {
    return this.reservations.setStatus(staff, id, dto);
  }

  /**
   * The restaurants in reach, each with its branches nested.
   *
   * The flat list below cannot show a restaurant that has no branches yet —
   * and that is the one someone needs to find, to give it a first branch.
   */
  @Get('restaurants')
  @RequiresPermission(Permission.BranchRead)
  listRestaurants(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListRestaurantsDto) {
    return this.menu.listRestaurants(staff, query);
  }

  /**
   * One restaurant, opened on its own.
   *
   * Declared before `restaurants/:id/people` is irrelevant to Nest's matching,
   * but note the pair: this one is `branch:read`, the people below are
   * `staff:read`. A `branch_staff` account holds the first and not the second,
   * so it sees the restaurant and not who else works there — which is why the
   * two are separate routes rather than one response with a section in it that
   * sometimes is not there.
   */
  @Get('restaurants/:id')
  @RequiresPermission(Permission.BranchRead)
  getRestaurant(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.getRestaurant(staff, id);
  }

  /**
   * How the restaurant will feed people — pickup, eating in after collecting
   * the order, table service, table booking.
   *
   * `restaurant:write`, which is held by a restaurant admin and above and by no
   * branch-level role: this is one statement covering every branch, so a
   * manager setting it at one branch would be answering for the others. The
   * permission was declared with services named in it and had no endpoint
   * behind it until now.
   *
   * The whole set at once, because the rules are about combinations — see
   * `MenuService.setServices`.
   */
  @Patch('restaurants/:id/services')
  @RequiresPermission(Permission.RestaurantWrite)
  setRestaurantServices(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRestaurantServicesDto,
  ) {
    return this.menu.setServices(staff, id, dto);
  }

  /**
   * The photograph on the restaurant's card, on the catalog, and behind its
   * page in the app.
   *
   * The same permission as the services above, and for the same reason: one
   * cover is shared by every branch, so a `restaurant_manager` running one
   * branch would be choosing the picture the others advertise under. Uploading
   * the file is a separate request (`POST /uploads/restaurant-cover`) — this
   * one only decides which restaurant wears it, which is the half the caller's
   * scope has to answer for.
   *
   * `coverUrl: null` takes it down; the column has always been nullable and
   * every client draws that state already.
   */
  @Patch('restaurants/:id/cover')
  @RequiresPermission(Permission.RestaurantWrite)
  setRestaurantCover(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRestaurantCoverDto,
  ) {
    return this.menu.setCover(staff, id, dto);
  }

  /** Who holds a role over the restaurant itself — its admins. Its branches'
   *  people are asked for per branch, below. */
  @Get('restaurants/:id/people')
  @RequiresPermission(Permission.StaffRead)
  getRestaurantPeople(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTeamDto,
  ) {
    return this.directory.listRestaurantPeople(staff, id, query);
  }

  /** The same branches, flat — for screens that pick one (menu, invites). */
  @Get('branches')
  @RequiresPermission(Permission.BranchRead)
  listBranches(@CurrentStaff() staff: StaffJwtPayload) {
    return this.menu.listBranches(staff);
  }

  /**
   * Who works at one branch — its manager and its shifts.
   *
   * Asked for a branch at a time because that is how it is read: a restaurant's
   * page opens one branch's team at a time, and a chain of forty would
   * otherwise send every one of them to draw the one somebody clicked.
   */
  @Get('branches/:id/people')
  @RequiresPermission(Permission.StaffRead)
  getBranchPeople(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTeamDto,
  ) {
    return this.directory.listBranchPeople(staff, id, query);
  }

  /** Adds a branch to a restaurant the caller administers. Until this existed,
   *  a restaurant created through the admin panel had nowhere to put a menu. */
  @Post('branches')
  @RequiresPermission(Permission.BranchCreate)
  createBranch(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateBranchDto) {
    return this.menu.createBranch(staff, dto);
  }

  /**
   * The shift's own switch: open, closed, and how long food is taking.
   *
   * Separate from the PATCH below because a `branch_staff` account may stop the
   * queue when the kitchen is under water, but has no business editing the
   * branch's address. One endpoint gated on two permissions would have to make
   * that distinction in the service, out of sight of the guard.
   */
  @Patch('branches/:id/status')
  @RequiresPermission(Permission.BranchHours)
  setBranchStatus(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBranchStatusDto,
  ) {
    return this.menu.setBranchStatus(staff, id, dto);
  }

  @Patch('branches/:id')
  @RequiresPermission(Permission.BranchWrite)
  updateBranch(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.menu.updateBranch(staff, id, dto);
  }

  /**
   * This branch's own photograph — `null` to wear the restaurant's again.
   *
   * `branch:write`, so a `restaurant_manager` may set it: branches of one chain
   * are different places, and the person who answers for this address answers
   * for what it looks like. The restaurant-level endpoint is the business's
   * default and stays at `restaurant:write`, which is the distinction — one
   * says what the chain looks like, this says what this branch looks like.
   *
   * Uploading is `POST /uploads/branch-cover`; this only decides which branch
   * wears the result.
   */
  @Patch('branches/:id/cover')
  @RequiresPermission(Permission.BranchWrite)
  setBranchCover(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBranchCoverDto,
  ) {
    return this.menu.setBranchCover(staff, id, dto);
  }

  /**
   * What this branch offers — `null` to follow the restaurant again.
   *
   * The same combination rules as the restaurant's, judging one address:
   * a branch with waiters has no use for "collect it and seat yourself"
   * whether or not the branch down the road does.
   *
   * `[]` and `null` are different answers — the first is this branch declaring
   * it offers nothing, the second is handing the question back to the business.
   */
  @Patch('branches/:id/services')
  @RequiresPermission(Permission.BranchWrite)
  setBranchServices(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBranchServicesDto,
  ) {
    return this.menu.setBranchServices(staff, id, dto);
  }

  // ── how a branch takes bookings ───────────────────────────────────────────
  //
  // Four things on three permissions, because they are three different jobs.
  // The room's furniture and the numbers behind the offer are `branch:write` —
  // a manager's decision. When the doors are open, and which days they are not,
  // is `branch:hours`, which a shift holds: closing tomorrow because the
  // freezer died is exactly the sort of thing the person on the floor has to be
  // able to do at 6pm without ringing anybody.
  //
  // Every one of these that *narrows* what the branch offers answers `409` with
  // the bookings it would strand, and goes through on a repeat carrying
  // `?force=true`. None of them cancels a booking.

  @Get('branches/:id/tables')
  @RequiresPermission(Permission.BranchRead)
  listTables(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingSettings.listTables(staff, id);
  }

  @Post('branches/:id/tables')
  @RequiresPermission(Permission.BranchWrite)
  createTable(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TableDto,
  ) {
    return this.bookingSettings.createTable(staff, id, dto);
  }

  @Patch('tables/:id')
  @RequiresPermission(Permission.BranchWrite)
  updateTable(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
    @Query() query: ForceDto,
  ) {
    return this.bookingSettings.updateTable(staff, id, dto, isForced(query));
  }

  /** Out of use, not out of the database — the bookings that name this table,
   *  including the ones already eaten, still have to resolve it. */
  @Delete('tables/:id')
  @RequiresPermission(Permission.BranchWrite)
  deleteTable(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ForceDto,
  ) {
    return this.bookingSettings.deleteTable(staff, id, isForced(query));
  }

  /** When tables may be held, or `null` to hold them whenever the kitchen is
   *  open. On `branch:hours`, beside the open/closed switch it belongs with. */
  @Patch('branches/:id/booking-hours')
  @RequiresPermission(Permission.BranchHours)
  setBookingHours(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBookingHoursDto,
    @Query() query: ForceDto,
  ) {
    return this.bookingSettings.setBookingHours(staff, id, dto.bookingHours, isForced(query));
  }

  @Get('branches/:id/closures')
  @RequiresPermission(Permission.BranchRead)
  listClosures(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingSettings.listClosures(staff, id);
  }

  @Post('branches/:id/closures')
  @RequiresPermission(Permission.BranchHours)
  createClosure(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClosureDto,
    @Query() query: ForceDto,
  ) {
    return this.bookingSettings.createClosure(staff, id, dto, isForced(query));
  }

  /** No force flag: giving a day back to the ordinary week cannot strand a
   *  booking made while it was shut. */
  @Delete('closures/:id')
  @RequiresPermission(Permission.BranchHours)
  deleteClosure(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingSettings.deleteClosure(staff, id);
  }

  /** Answers with three sets — what this branch decided, what it would inherit,
   *  and what is therefore in force — so a form can tell a deliberate 90 from
   *  an inherited one. */
  @Get('branches/:id/booking-policy')
  @RequiresPermission(Permission.BranchRead)
  branchPolicy(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingSettings.branchPolicy(staff, id);
  }

  /** An explicit `null` in a field is this branch handing that question back to
   *  its restaurant — the only way an override is ever undone, and why the DTO
   *  accepts nulls rather than only numbers. */
  @Patch('branches/:id/booking-policy')
  @RequiresPermission(Permission.BranchWrite)
  setBranchPolicy(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingPolicyDto,
  ) {
    return this.bookingSettings.setBranchPolicy(staff, id, dto);
  }

  @Get('restaurants/:id/booking-policy')
  @RequiresPermission(Permission.BranchRead)
  restaurantPolicy(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingSettings.restaurantPolicy(staff, id);
  }

  /** `restaurant:write`, unlike the branch one: this is the chain's answer for
   *  every address it has, and the manager of one of them does not get to make
   *  it for the others. */
  @Patch('restaurants/:id/booking-policy')
  @RequiresPermission(Permission.RestaurantWrite)
  setRestaurantPolicy(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingPolicyDto,
  ) {
    return this.bookingSettings.setRestaurantPolicy(staff, id, dto);
  }

  /**
   * The day these settings would actually produce.
   *
   * A form full of numbers is not something a person can check, and the
   * mistakes here — hours that close before they open, a seating longer than
   * the evening — show up as an empty calendar rather than as an error. This is
   * where they get noticed by whoever caused them.
   */
  @Get('branches/:id/booking-preview')
  @RequiresPermission(Permission.BranchRead)
  bookingPreview(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BookingPreviewDto,
  ) {
    return this.bookingSettings.preview(staff, id, query);
  }

  /** Whether this branch takes table bookings, or `null` to follow the
   *  restaurant. Moved down with the services because `reserve` is one of
   *  them, and the two must agree per address. */
  @Patch('branches/:id/bookings')
  @RequiresPermission(Permission.BranchWrite)
  setBranchBookings(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBranchBookingsDto,
  ) {
    return this.menu.setBranchBookings(staff, id, dto);
  }

  /** Returns the raw `*_i18n` objects — the caller edits every language, so
   *  resolving one would hide the others. */
  @Get('menu-items')
  @RequiresPermission(Permission.MenuRead)
  listMenu(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListMenuItemsDto) {
    return this.menu.listMenu(staff, query);
  }

  /**
   * How this dish got to the price it is at: who put it on the menu, every edit
   * since, and who marked it sold out.
   *
   * `menu:read` rather than `staff:activity` — the same rule that puts an
   * order's timeline behind `orders:read`. Whoever may read the menu may read
   * how it came to say what it says; a record of one *person's* day across every
   * dish they touched is the other endpoint, and the other permission.
   */
  @Get('menu-items/:id/history')
  @RequiresPermission(Permission.MenuRead)
  menuItemHistory(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.menuHistory.list(staff, id);
  }

  @Post('menu-items')
  @RequiresPermission(Permission.MenuWrite)
  createMenuItem(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateMenuItemDto) {
    return this.menu.create(staff, dto);
  }

  /**
   * Sold out, and back again.
   *
   * The one menu change a shift may make: it says what is true right now and
   * reverses in a tap, unlike a price, which outlives the shift that set it.
   */
  @Patch('menu-items/:id/availability')
  @RequiresPermission(Permission.MenuAvailability)
  setAvailability(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.menu.setAvailability(staff, id, dto);
  }

  @Patch('menu-items/:id')
  @RequiresPermission(Permission.MenuWrite)
  updateMenuItem(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.update(staff, id, dto);
  }

  @Delete('menu-items/:id')
  @RequiresPermission(Permission.MenuWrite)
  @HttpCode(204)
  removeMenuItem(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.remove(staff, id);
  }

  /**
   * The branch's own menu headings — "Mains", "Сеты", "Խորոված".
   *
   * A branch names as many as its menu needs and orders them itself; the four
   * fixed tabs this replaced could not express a fifth. Where a heading maps
   * onto a platform category, every dish under it inherits that category and
   * becomes findable from the home screen without anybody tagging dishes one at
   * a time — which is the whole reason the mapping exists.
   *
   * `menu:write`, the same permission that adds and prices a dish. A shift with
   * `menu:availability` may flip a dish sold out and may not reorganise a menu.
   */
  @Get('menu-sections')
  @RequiresPermission(Permission.MenuRead)
  listMenuSections(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListMenuSectionsDto) {
    return this.sections.list(staff, query);
  }

  @Post('menu-sections')
  @RequiresPermission(Permission.MenuWrite)
  createMenuSection(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateMenuSectionDto) {
    return this.sections.create(staff, dto);
  }

  @Patch('menu-sections/:id')
  @RequiresPermission(Permission.MenuWrite)
  updateMenuSection(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuSectionDto,
  ) {
    return this.sections.update(staff, id, dto);
  }

  /** Refused while live dishes sit under it — 409 with the count. Moving them
   *  somewhere automatically would put food on a shelf nobody chose. */
  @Delete('menu-sections/:id')
  @RequiresPermission(Permission.MenuWrite)
  @HttpCode(204)
  removeMenuSection(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sections.remove(staff, id);
  }
}
