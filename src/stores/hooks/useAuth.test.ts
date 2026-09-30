import { describe, expect, it } from 'vitest';
import { visibleBranchIdsFor } from './useAuth';

const branches = [
  { id: 'b-01' },
  { id: 'b-02' },
  { id: 'b-ck' },
];

describe('visibleBranchIdsFor', () => {
  it('returns [] when no current user', () => {
    expect(visibleBranchIdsFor(null, branches)).toEqual([]);
  });

  it('returns the single branch id when user is scoped to a branch', () => {
    expect(visibleBranchIdsFor({ branchId: 'b-01' }, branches)).toEqual(['b-01']);
  });

  it('returns all branch ids when user.branchId === "all"', () => {
    expect(visibleBranchIdsFor({ branchId: 'all' }, branches)).toEqual(['b-01', 'b-02', 'b-ck']);
  });

  it('returns [] when branchId is missing', () => {
    expect(visibleBranchIdsFor({}, branches)).toEqual([]);
  });
});