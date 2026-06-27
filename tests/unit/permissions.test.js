const { isAdmin, canAccessUser, canMutateUser, assertOwnsOrAdmin, assertCanMutate, scopeToUser } = require('../../src/core/permissions');

describe('permissions', () => {
  const admin = { id: 'admin-1', role: 'admin' };
  const owner = { id: 'user-1', role: 'user' };
  const viewer = { id: 'user-1', role: 'viewer' };
  const stranger = { id: 'user-2', role: 'user' };

  test('isAdmin', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(owner)).toBe(false);
    expect(isAdmin(null)).toBeFalsy();
  });

  test('canAccessUser allows the owner and any admin, blocks everyone else', () => {
    expect(canAccessUser(owner, 'user-1')).toBe(true);
    expect(canAccessUser(admin, 'user-1')).toBe(true);
    expect(canAccessUser(stranger, 'user-1')).toBe(false);
    expect(canAccessUser(null, 'user-1')).toBe(false);
  });

  test('canMutateUser blocks viewers even when they own the resource', () => {
    expect(canMutateUser(owner, 'user-1')).toBe(true);
    expect(canMutateUser(admin, 'user-1')).toBe(true);
    expect(canMutateUser(viewer, 'user-1')).toBe(false);
    expect(canMutateUser(stranger, 'user-1')).toBe(false);
  });

  test('assertOwnsOrAdmin throws a 404 for a missing resource', () => {
    expect.assertions(1);
    try {
      assertOwnsOrAdmin(owner, null, 'integration');
    } catch (err) {
      expect(err.statusCode).toBe(404);
    }
  });

  test('assertOwnsOrAdmin throws a 403 when the user does not own the resource and is not an admin', () => {
    expect.assertions(1);
    try {
      assertOwnsOrAdmin(stranger, { userId: 'user-1' }, 'integration');
    } catch (err) {
      expect(err.statusCode).toBe(403);
    }
  });

  test('assertOwnsOrAdmin does not throw for the owner or an admin', () => {
    expect(() => assertOwnsOrAdmin(owner, { userId: 'user-1' }, 'integration')).not.toThrow();
    expect(() => assertOwnsOrAdmin(admin, { userId: 'user-1' }, 'integration')).not.toThrow();
  });

  test('assertCanMutate rejects viewers', () => {
    expect(() => assertCanMutate(owner, { userId: 'user-1' }, 'integration')).not.toThrow();
    expect(() => assertCanMutate(admin, { userId: 'user-1' }, 'integration')).not.toThrow();
    expect(() => assertCanMutate(viewer, { userId: 'user-1' }, 'integration')).toThrow(/cannot change or run/);
  });

  test('scopeToUser adds a userId filter for non-admins only', () => {
    expect(scopeToUser(owner, { type: 'webhook' })).toEqual({ type: 'webhook', userId: 'user-1' });
    expect(scopeToUser(admin, { type: 'webhook' })).toEqual({ type: 'webhook' });
  });
});
