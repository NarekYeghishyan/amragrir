import { describe, expect, it } from 'vitest';
import type { StaffBranch } from './api';
import {
  branchesOf,
  firstBranchOf,
  restaurantsOf,
  showsBranchFilter,
  soleBranchOf,
} from './scope';

const branch = (over: Partial<StaffBranch>): StaffBranch => ({
  id: 'b1',
  restaurantId: 'r1',
  restaurantName: 'Dolmama',
  name: 'Northern Ave',
  address: null,
  city: 'Yerevan',
  phone: null,
  isOpen: true,
  avgPrepMin: 20,
  menuItemCount: 12,
  ...over,
});

/**
 * Two branches of different restaurants that share a name — the case that
 * makes picking the restaurant first worth doing. In one flat list these are
 * two rows reading "Northern Ave", told apart only by grey small print.
 */
const BRANCHES: StaffBranch[] = [
  branch({ id: 'b1', restaurantId: 'r1', restaurantName: 'Dolmama' }),
  branch({ id: 'b2', restaurantId: 'r1', restaurantName: 'Dolmama', name: 'Cascade' }),
  branch({ id: 'b3', restaurantId: 'r2', restaurantName: 'Lavash' }),
];

describe('restaurantsOf', () => {
  it('names each restaurant once, however many branches it has', () => {
    expect(restaurantsOf(BRANCHES)).toEqual([
      ['r1', 'Dolmama'],
      ['r2', 'Lavash'],
    ]);
  });

  it('keeps the order the branches arrived in', () => {
    // Insertion order, not alphabetical: sorting by name would reshuffle the
    // whole picker the day somebody renames a restaurant.
    const reversed = [...BRANCHES].reverse();
    expect(restaurantsOf(reversed).map(([id]) => id)).toEqual(['r2', 'r1']);
  });

  it('has nothing to offer an account with no branches', () => {
    expect(restaurantsOf([])).toEqual([]);
  });
});

describe('branchesOf', () => {
  it('narrows to one restaurant', () => {
    expect(branchesOf(BRANCHES, 'r1').map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(branchesOf(BRANCHES, 'r2').map((b) => b.id)).toEqual(['b3']);
  });

  it('does not narrow when no restaurant is chosen', () => {
    // The order board's "All restaurants" state. The menu never passes this —
    // it always has a concrete restaurant — but both want an empty id to mean
    // "do not narrow" rather than "match nothing".
    expect(branchesOf(BRANCHES, '')).toHaveLength(3);
  });

  it('is empty for a restaurant that is not in the list', () => {
    expect(branchesOf(BRANCHES, 'r9')).toEqual([]);
  });
});

describe('firstBranchOf', () => {
  it('is where picking a restaurant lands you', () => {
    // A menu belongs to a branch, so choosing a restaurant has to choose one
    // too — otherwise the screen is blank until a second click.
    expect(firstBranchOf(BRANCHES, 'r1')).toBe('b1');
    expect(firstBranchOf(BRANCHES, 'r2')).toBe('b3');
  });

  it('is empty when there is nothing to land on', () => {
    expect(firstBranchOf(BRANCHES, 'r9')).toBe('');
    expect(firstBranchOf([], 'r1')).toBe('');
  });

  it('always lands on a branch of the restaurant asked for', () => {
    for (const [id] of restaurantsOf(BRANCHES)) {
      const landed = firstBranchOf(BRANCHES, id);
      expect(BRANCHES.find((b) => b.id === landed)?.restaurantId).toBe(id);
    }
  });
});

describe('soleBranchOf', () => {
  it('selects the branch of a restaurant that has only one', () => {
    expect(soleBranchOf(BRANCHES, 'r2')).toBe('b3');
  });

  it('chooses nothing for a restaurant with several', () => {
    // Here "which branch" is a real question, and the board answers it with
    // all of them until somebody says otherwise.
    expect(soleBranchOf(BRANCHES, 'r1')).toBe('');
  });

  it('chooses nothing when no restaurant is chosen', () => {
    expect(soleBranchOf(BRANCHES, '')).toBe('');
  });

  it('does not turn "all restaurants" into a branch for a one-branch account', () => {
    // The guard this function opens with. `branchesOf` reads an empty id as
    // "do not narrow", so without it an account holding a single branch would
    // have that branch *selected* by picking All restaurants — the one control
    // that clears the scope would be the one that sets it.
    expect(soleBranchOf([branch({ id: 'b1' })], '')).toBe('');
  });

  it('chooses nothing for a restaurant that is not in the list', () => {
    expect(soleBranchOf(BRANCHES, 'r9')).toBe('');
    expect(soleBranchOf([], 'r1')).toBe('');
  });

  it('only ever picks a branch of the restaurant asked for', () => {
    for (const [id] of restaurantsOf(BRANCHES)) {
      const picked = soleBranchOf(BRANCHES, id);
      if (picked !== '') {
        expect(BRANCHES.find((b) => b.id === picked)?.restaurantId).toBe(id);
      }
    }
  });

  it('never selects a branch the filter would not be showing', () => {
    // The two run together: a selection nobody can see is a filter applied
    // with nothing on screen saying so.
    for (const restaurantId of ['', 'r1', 'r2', 'r9']) {
      if (soleBranchOf(BRANCHES, restaurantId) !== '') {
        expect(
          showsBranchFilter(restaurantId, branchesOf(BRANCHES, restaurantId).length),
        ).toBe(true);
      }
    }
  });
});

describe('showsBranchFilter', () => {
  it('shows it when there is more than one branch to choose from', () => {
    expect(showsBranchFilter('', 3)).toBe(true);
    expect(showsBranchFilter('', 2)).toBe(true);
  });

  it('keeps it once a restaurant is chosen, even with a single branch', () => {
    // The case this exists for. Hiding it here means the control vanishes at
    // the moment somebody narrows to a restaurant — which reads as the filter
    // bar breaking, and leaves the branch they are now looking at unnamed.
    expect(showsBranchFilter('r2', 1)).toBe(true);
  });

  it('hides it for an account whose whole reach is one branch', () => {
    // Most kitchens. A select holding one option is furniture.
    expect(showsBranchFilter('', 1)).toBe(false);
    expect(showsBranchFilter('', 0)).toBe(false);
  });

  it('agrees with what branchesOf would offer', () => {
    // The two are read together in the toolbar, so the count fed in here is
    // always the length of that list.
    for (const restaurantId of ['', 'r1', 'r2', 'r9']) {
      const offered = branchesOf(BRANCHES, restaurantId);
      expect(showsBranchFilter(restaurantId, offered.length)).toBe(
        restaurantId !== '' || offered.length > 1,
      );
    }
  });
});
