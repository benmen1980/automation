/**
 * Centralized ownership checks. Every route that touches a user-scoped
 * resource (integration, execution, log, credential) must go through one
 * of these instead of trusting the request body/query for userId.
 * Per docs/product/product-architecture-spec.md 10.1: never rely only on frontend filtering.
 */

function isAdmin(user) {
  return user && user.role === 'admin';
}

function isViewer(user) {
  return user && user.role === 'viewer';
}

/**
 * Returns true if `user` may access a resource owned by `resourceUserId`.
 */
function canAccessUser(user, resourceUserId) {
  if (!user) return false;
  return isAdmin(user) || user.id === resourceUserId;
}

function canMutateUser(user, resourceUserId) {
  if (!canAccessUser(user, resourceUserId)) return false;
  return isAdmin(user) || !isViewer(user);
}

/**
 * Throws a 403-shaped error if `user` does not own `resource` (an object
 * with a `userId` field) and is not an admin.
 */
function assertOwnsOrAdmin(user, resource, label = 'resource') {
  if (!resource) {
    const err = new Error(`${label} not found.`);
    err.statusCode = 404;
    throw err;
  }
  if (!canAccessUser(user, resource.userId)) {
    const err = new Error(`You do not have access to this ${label}.`);
    err.statusCode = 403;
    throw err;
  }
}

function assertCanMutate(user, resource, label = 'resource') {
  assertOwnsOrAdmin(user, resource, label);
  if (!canMutateUser(user, resource.userId)) {
    const err = new Error(`Your role can view this ${label}, but cannot change or run it.`);
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Builds a Prisma `where` filter that scopes a query to the current user
 * unless they're an admin (in which case no filter is applied).
 */
function scopeToUser(user, extraWhere = {}) {
  if (isAdmin(user)) return extraWhere;
  return { ...extraWhere, userId: user.id };
}

module.exports = { isAdmin, isViewer, canAccessUser, canMutateUser, assertOwnsOrAdmin, assertCanMutate, scopeToUser };
