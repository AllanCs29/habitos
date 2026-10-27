// Shared application state; feature modules own their behavior, not persistence.
export const runtime = {
  activeTab: "today",
  authEpoch: 0,
  persistenceStatus: "local",
  syncError: "",
  pendingAI: new Map(),
  undoStack: [],
};
export const actions = {};
