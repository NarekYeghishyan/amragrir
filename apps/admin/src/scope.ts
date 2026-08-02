import type { StaffBranch } from './api';

/**
 * Picking a restaurant, then one of its branches.
 *
 * Two screens do this — the menu, which edits one branch at a time, and the
 * order board, which narrows a queue — and both derive it from the same flat
 * `GET /restaurant/branches` the shell already holds. Pure functions in their
 * own module so the arithmetic of "which branches belong to this restaurant"
 * is tested without mounting a Radix select, whose options are not in
 * server-rendered markup at all.
 */

/**
 * One entry per restaurant, in the order its branches arrive.
 *
 * A `Map` rather than a `Set` of ids because the label has to come along, and
 * insertion order is what keeps the list stable between renders — sorting by
 * name would reorder the whole picker when a restaurant is renamed.
 */
export function restaurantsOf(branches: readonly StaffBranch[]): [string, string][] {
  return [...new Map(branches.map((branch) => [branch.restaurantId, branch.restaurantName]))];
}

/**
 * The branches under one restaurant — or all of them when none is chosen.
 *
 * The empty case is not a quirk: the order board has an "All restaurants"
 * state and the menu does not, and both want this to mean "do not narrow".
 */
export function branchesOf(
  branches: readonly StaffBranch[],
  restaurantId: string,
): StaffBranch[] {
  return branches.filter(
    (branch) => restaurantId === '' || branch.restaurantId === restaurantId,
  );
}

/**
 * The branch to land on when a restaurant is picked.
 *
 * Empty when the restaurant has none, which the callers treat as "nothing
 * selected" — though a restaurant reached *through* its branches always has at
 * least one.
 */
export function firstBranchOf(branches: readonly StaffBranch[], restaurantId: string): string {
  return branches.find((branch) => branch.restaurantId === restaurantId)?.id ?? '';
}

/**
 * The branch to select outright when a restaurant is picked — its **only**
 * branch, or nothing when it has several.
 *
 * Different question from `firstBranchOf`, which the menu uses: that one lands
 * on *a* branch because a menu has to belong to one, and the first of five is
 * as good a guess as any. This one only selects when there is no guess to
 * make. A restaurant with one branch has exactly one answer to "which branch",
 * and leaving the filter on "All branches" makes somebody state it — a click
 * whose outcome was decided before they made it.
 *
 * The empty `restaurantId` is guarded rather than left to `branchesOf`, which
 * reads it as "do not narrow": an account whose whole reach is one branch
 * would then have that branch selected by choosing **All restaurants**, so the
 * one control that clears the scope would set it instead.
 */
export function soleBranchOf(branches: readonly StaffBranch[], restaurantId: string): string {
  if (restaurantId === '') {
    return '';
  }
  const [only, ...rest] = branchesOf(branches, restaurantId);
  return only !== undefined && rest.length === 0 ? only.id : '';
}

/**
 * Whether the order board's branch filter is worth showing.
 *
 * Two cases, and the second is the one that is easy to get wrong:
 *
 * - **More than one branch to choose from** — obviously yes.
 * - **A restaurant has been chosen** — yes even if it turns out to have a
 *   single branch. Hiding it there means the control disappears at the moment
 *   somebody narrows to a restaurant, which reads as the filter bar breaking,
 *   and leaves the one branch they are now looking at unnamed anywhere on
 *   screen. It stays, showing that branch — `soleBranchOf` has already
 *   selected it — so the control both names where the board is pointed and
 *   offers the way back out of it.
 *
 * What is left out is the genuinely useless case: an account whose whole reach
 * is a single branch, with no restaurant chosen. That is most kitchens, and a
 * select with one option in it is furniture.
 */
export function showsBranchFilter(restaurantId: string, branchCount: number): boolean {
  return restaurantId !== '' || branchCount > 1;
}
