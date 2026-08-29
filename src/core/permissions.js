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

function canAccessIntegration(user, integration) {
  if (!user || !integration) return false;
  if (isAdmin(user)) return true;
  if (integration.assignedUserUid) return Boolean(user.userUid) && user.userUid === integration.assignedUserUid;
  // Narrow compatibility fallback for rows created before Phase 1 identity
  // population. Phase 2-created users have userUid and cannot access a null
  // assignment.
  return !user.userUid && user.id === integration.userId;
}

function canMutateIntegration(user, integration) {
  return canAccessIntegration(user, integration) && !isViewer(user);
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
  const allowed = Object.prototype.hasOwnProperty.call(resource, 'assignedUserUid')
    ? canAccessIntegration(user, resource)
    : canAccessUser(user, resource.userId);
  if (!allowed) {
    const err = new Error(`You do not have access to this ${label}.`);
    err.statusCode = 403;
    throw err;
  }
}

function assertCanMutate(user, resource, label = 'resource') {
  assertOwnsOrAdmin(user, resource, label);
  const allowed = Object.prototype.hasOwnProperty.call(resource, 'assignedUserUid')
    ? canMutateIntegration(user, resource)
    : canMutateUser(user, resource.userId);
  if (!allowed) {
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

function integrationAccessWhere(user) {
  if (isAdmin(user)) return {};
  if (user?.userUid) return { assignedUserUid: user.userUid };
  return { assignedUserUid: null, userId: user?.id };
}

module.exports = {
  isAdmin,
  isViewer,
  canAccessUser,
  canMutateUser,
  canAccessIntegration,
  canMutateIntegration,
  assertOwnsOrAdmin,
  assertCanMutate,
  scopeToUser,
  integrationAccessWhere,
};
