## 2026-04-13 - [Initial Performance Review]
**Learning:** Found that all page components are statically imported in App.tsx, causing the entire application (including the internal operator console) to be loaded upfront even for public users.
**Action:** Implement route-based code splitting using React.lazy and Suspense to improve initial load performance.

## 2026-04-20 - [Optimizing Console Responsiveness]
**Learning:** Search filtering in the Signal Queue was blocking the main thread, causing input lag. Additionally, redundant `new Date()` allocations inside render loops created unnecessary GC pressure.
**Action:** Implemented `useDeferredValue` for search terms to prioritize input responsiveness. Refactored date formatting to pass raw numeric timestamps directly to `Intl.DateTimeFormat`, avoiding redundant object allocations.

## 2026-04-21 - [Effective Memoization Patterns]
**Learning:** Found that several large UI components (like `SignalDeskHeader`) were wrapped in `React.memo`, but their parent components were passing unstable inline arrow functions as props, causing them to re-render on every keystroke in nearby input fields.
**Action:** Stabilized navigation and scroll handlers using `useCallback` in `IntakePage` and `StatusPage`. Memoized the static `SignalFooter` and complex `StatusTimeline` to further reduce the virtual DOM diffing overhead during high-frequency updates.

## 2026-04-22 - [Optimizing List Rendering via Component Isolation]
**Learning:** Found that `useDeferredValue` alone doesn't prevent the re-evaluation of complex JSX trees in the same component. Even if data doesn't change, React still diffs the entire tree on parent re-renders unless children are memoized components receiving stable props.
**Action:** Extracted and memoized the Signal Queue table into dedicated components. Stabilized event handlers with `useCallback` to ensure the memoization remains effective during high-frequency state updates like typing.

## 2026-04-23 - [Referential Stability Cache Pattern]
**Learning:** `useMemo` is often used for array indexing/transformation, but recreating derived objects in the loop breaks `React.memo` in downstream list components. If the parent array is recreated (common with state updates), every child re-renders even if its individual source data hasn't changed.
**Action:** Implemented a manual referential stability cache using `useRef` inside `useMemo`. By comparing raw source references, we can preserve exact derived object identities for unchanged items, enabling effective list-wide memoization even when the parent state is updated.

## 2026-04-30 - [Map Indexing Pattern]
**Learning:** For single-item lookups (e.g., finding a specific ticket by ID), indexing the source array into a memoized `Map` within `useMemo` converts O(N) `.find()` operations into O(1) lookups. Additionally, transitioning from manual search state (`searchedSignal`) to derived state based on the search term and the Map ensures data consistency, as the UI automatically reflects updates to the underlying KV data without manual synchronization.
**Action:** Use the Map Indexing Pattern for high-frequency or data-critical lookups to ensure both performance scalability and referential/data integrity.

## 2026-05-07 - [Background Webhook Pattern]
**Learning:** External notifications (Discord/Telegram) were blocking navigation to the success page. Removing `await` from these calls eliminates perceived latency, but standard fetch calls can be cancelled on unmount/navigation.
**Action:** Implemented the Background Webhook Pattern by using `keepalive: true` in `fetch` and removing the `await` in `IntakePage`. This ensures reliable delivery while providing instantaneous navigation.

## 2026-05-14 - [Isolating High-Frequency Input State]
**Learning:** High-frequency local state (like text inputs) in a large component triggers full-tree re-renders and expensive derived computations (like sorting logs or formatting dates) on every keystroke.
**Action:** Extract high-frequency state into memoized sub-components. Pre-calculate all formatted strings (especially dates) within the `useMemo` blocks that derive state, ensuring the main render loop remains lightweight.

## 2026-05-08 - [Advanced Deferral Pattern in ConsolePage]
**Learning:** Found that even with `useDeferredValue` for filtering, local state updates for search and settings inputs in `ConsolePage.tsx` were still triggering full-component re-renders (including O(N) indexing) on every keystroke.
**Action:** Implemented the Advanced Deferral Pattern by isolating inputs into memoized sub-components (`SearchAction`, `SettingsDialogContent`). By applying `useDeferredValue` to the local child state and notifying the parent via `useEffect`, we ensure the expensive parent state only re-evaluates when the deferred value changes, achieving zero input lag.

## 2026-05-21 - [State Update Bailout Pattern]
**Learning:** Even with memoized components, parent state updates trigger a full virtual DOM reconciliation for the entire tree. For navigation-heavy flows (like marking a list item as 'viewed'), triggering a state update blindly on every click causes redundant render cycles for the entire list.
**Action:** Implement a State Update Bailout in the state setter. Verify if the target state actually needs changing (e.g., `if (!signal.isNew) return current`) before returning a new object reference. This ensures React completely skips the render phase for unchanged data, achieving zero overhead for repeat interactions.
