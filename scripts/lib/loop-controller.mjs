const RECONCILIATION_ACTIONS = new Set([
  "no-op",
  "patch",
  "rebuild-projection",
  "rebind",
  "re-resolve-preset",
  "block"
]);

export function selectReconciliationAction(eventType, eventActions) {
  const action = eventActions?.[eventType];
  if (!RECONCILIATION_ACTIONS.has(action)) {
    throw new Error(`unsupported event reconciliation action: ${eventType}`);
  }
  return action;
}
