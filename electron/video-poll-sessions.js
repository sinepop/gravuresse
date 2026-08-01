function identitySet(values) {
  return new Set((Array.isArray(values) ? values : []).map(value => String(value || '')).filter(Boolean))
}

function invalidateVideoPollSessions(sessions, identities = {}) {
  const connectionIds = identitySet(identities.connectionIds)
  const accountIds = identitySet(identities.accountIds)
  if (connectionIds.size === 0 && accountIds.size === 0) return 0

  let removed = 0
  for (const [taskId, session] of sessions) {
    const connectionId = String(session?.connectionId || '')
    const accountId = String(session?.accountId || '')
    if (
      (connectionId && connectionIds.has(connectionId)) ||
      (accountId && accountIds.has(accountId))
    ) {
      sessions.delete(taskId)
      removed += 1
    }
  }
  return removed
}

module.exports = { invalidateVideoPollSessions }
