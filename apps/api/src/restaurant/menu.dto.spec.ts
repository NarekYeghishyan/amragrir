import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MenuTab } from '@amragrir/shared';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';

/**
 * The photo rule, checked where it is enforced.
 *
 * A dish goes on the menu with a picture or it does not go on it, and that is
 * decided by the DTO rather than by the service — so a service test cannot see
 * it. This runs the same two steps the global `ValidationPipe` does
 * (`transform: true`, then validate), which is what makes the trimming below
 * part of the answer instead of an implementation detail.
 */
const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO = 'https://cdn.amragrir.am/khorovats.jpg';

const failedFields = (dto: object): string[] =>
  validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (error) => error.property,
  );

const createBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  branchId: BRANCH_ID,
  menuTab: MenuTab.Mains,
  nameI18n: { hy: 'Խորոված' },
  priceAmd: 5800,
  photoUrl: PHOTO,
  ...over,
});

const create = (over: Record<string, unknown> = {}): CreateMenuItemDto =>
  plainToInstance(CreateMenuItemDto, createBody(over));

const update = (body: Record<string, unknown>): UpdateMenuItemDto =>
  plainToInstance(UpdateMenuItemDto, body);

describe('CreateMenuItemDto.photoUrl', () => {
  it('accepts a dish that has one', () => {
    expect(failedFields(create())).toEqual([]);
  });

  it('refuses a dish without one', () => {
    const { photoUrl: _omitted, ...withoutPhoto } = createBody();

    expect(failedFields(plainToInstance(CreateMenuItemDto, withoutPhoto))).toContain('photoUrl');
  });

  it.each([
    ['empty', ''],
    // Would satisfy `@IsNotEmpty` on its own — the trim is what catches it.
    ['blank', '   '],
    ['not a URL', 'khorovats.jpg'],
    // Relative paths have nowhere to resolve against: the panel, the site and
    // the app are three different origins.
    ['relative', '/img/khorovats.jpg'],
    ['not http(s)', 'javascript:alert(1)'],
  ])('refuses a photo that is %s', (_label, photoUrl) => {
    expect(failedFields(create({ photoUrl }))).toContain('photoUrl');
  });

  it('keeps a URL that arrived with the whitespace somebody pasted around it', () => {
    const dto = create({ photoUrl: `  ${PHOTO}  ` });

    expect(failedFields(dto)).toEqual([]);
    expect(dto.photoUrl).toBe(PHOTO);
  });

  it('accepts a development host, which has no TLD', () => {
    expect(failedFields(create({ photoUrl: 'http://localhost:4000/uploads/a.jpg' }))).toEqual([]);
  });
});

describe('UpdateMenuItemDto.photoUrl', () => {
  it('leaves the photo alone when the PATCH does not mention it', () => {
    expect(failedFields(update({ priceAmd: 6200 }))).toEqual([]);
  });

  it('accepts a different photo', () => {
    expect(failedFields(update({ photoUrl: PHOTO }))).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
  ])('refuses %s, which would take the picture off the dish', (_label, photoUrl) => {
    expect(failedFields(update({ photoUrl }))).toContain('photoUrl');
  });
});

/**
 * The other half of the same question, answered the other way round.
 *
 * A photo is required, so `null` is refused. An estimate is not, so `null` is
 * how it is taken back — and the difference between the two is one decorator,
 * which is exactly the sort of thing that is silently wrong until something
 * asks.
 */
describe('UpdateMenuItemDto.prepMin', () => {
  it('accepts a new estimate', () => {
    expect(failedFields(update({ prepMin: 30 }))).toEqual([]);
  });

  it('accepts null, which is how a dish stops claiming a time', () => {
    const dto = update({ prepMin: null });

    expect(failedFields(dto)).toEqual([]);
    // Still null after transforming: `@Type(() => Number)` would turn it into 0
    // if it applied to null, and 0 is both a claim and below the minimum.
    expect(dto.prepMin).toBeNull();
  });

  it.each([
    ['zero, which is not an estimate', 0],
    ['a negative number', -5],
    ['longer than a working day', 481],
    ['a fraction of a minute', 12.5],
  ])('refuses %s', (_label, prepMin) => {
    expect(failedFields(update({ prepMin }))).toContain('prepMin');
  });
});
