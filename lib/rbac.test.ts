import { describe, expect, it } from 'vitest';
import { canCheckHealth, canEdit, canRunBuild, isAdmin } from '@/lib/rbac';
import { USER_ROLES } from '@/types/common';

// Every role check in the app goes through these helpers, so a wrong answer here
// is a wrong answer everywhere: in a page guard, a service's re-check and the UI.

describe('isAdmin', () => {
  it('is true for admin only', () => {
    expect(USER_ROLES.filter(isAdmin)).toEqual(['admin']);
  });

  it('is false without a role', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe('canEdit', () => {
  it('lets editors and admins edit, not viewers', () => {
    expect(USER_ROLES.filter(canEdit)).toEqual(['editor', 'admin']);
  });

  it('is false without a role', () => {
    expect(canEdit(null)).toBe(false);
  });
});

describe('every-role capabilities', () => {
  it.each([
    ['canRunBuild', canRunBuild],
    ['canCheckHealth', canCheckHealth],
  ])('%s is open to every signed-in role and closed without one', (_name, check) => {
    expect(USER_ROLES.every(check)).toBe(true);
    expect(check(null)).toBe(false);
    expect(check(undefined)).toBe(false);
  });
});
