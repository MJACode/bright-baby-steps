// Module-level event bus for opening the VisitPrep Sheet from outside the card
// that owns it — mirrors chatOpener.ts. The Next Step feed surfaces a "checkup
// in N days" row that needs to open VisitPrepCard's existing Sheet; rather than
// lift the Sheet's open state up into the Dashboard, the feed dispatches here
// and VisitPrepCard subscribes once on mount.
const bus = new EventTarget();
const EVENT = "open-visit-prep";

export function openVisitPrep(): void {
  bus.dispatchEvent(new Event(EVENT));
}

export function onVisitPrepOpen(listener: () => void): () => void {
  const handler = () => listener();
  bus.addEventListener(EVENT, handler);
  return () => bus.removeEventListener(EVENT, handler);
}
