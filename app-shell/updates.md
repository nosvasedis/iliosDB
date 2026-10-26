# Application update and restart safety

`lib/appUpdates.ts` owns optional restarts. A deployment, failed import, connectivity
event, or service-worker event must never call reload/replace or purge user data.
The provider sits above role-specific pages and renders one bottom-left notification
stack, shared with activity cards. Deferred updates remain accessible as a pill.

## Editors and operations

- Register `useRestartDraft(label, editableData, options)` in the component or hook
  that owns the draft. Include submitted fields and unfinished line editors; exclude
  search/filter state, cached catalogue objects and calculated costs.
- Use `enabled` for editors that stay mounted while closed, `identity` for different
  records, and `initiallyDirty` for newly generated, not-yet-persisted documents.
- `markSaved(submittedData)` belongs only after a successful save. Its default is
  the snapshot from that render: completing an older save must not clear newer edits.
  An updater function can acknowledge one independently saved record in a collection.
- Background hydration must not replace a dirty editor. When a pristine editor
  accepts refreshed data, acknowledge exactly that data as its new baseline.
- `useRestartBlocker({label, dirty, busy})` covers explicit state machines. Block
  through uploads and multi-step saves, including periods between individual writes.
- Direct API/repository writes use `withProtectedWrites`; standalone operations can
  use `protectOperation`. Read methods keep their original identity. All writes must
  settle their blocker in `finally`. React Query mutations are also observed centrally.
- A new unregistered editor is not automatically protected. Add its blocker and a
  regression test whenever introducing a stateful editing workflow.

## Updates and failure recovery

The Vite build emits `/version.json` with the same opaque build ID embedded in the
application. Checks run after load, every five visible minutes, and on focus/reconnect
(one-minute throttle). Version metadata bypasses HTTP and service-worker caches.
Failed checks do not announce a new build. Development does not register/check workers.

Only the Restart button can navigate for an optional restart. It rejects dirty/busy
workspaces, freezes editing during an online preflight, checks blockers again, and
navigates once. Failed preflight unlocks the existing workspace. Clearing a blocker
never retries the restart automatically. Durable offline queues and existing drafts
are retained; pending queue replay blocks restarting.

Lazy modules use a stable first lazy identity and a local, resettable error boundary.
Do not create that first identity during a render that can suspend: React can discard
its hook state before commit, causing a permanent loading loop.

Workers wait for controlled tabs to close; they never force activation or claim live
pages. Immutable assets remain available across deployments and cached HTML is used
only when network navigation fails. Update recovery never unregisters workers or
deletes caches, local storage, IndexedDB, authentication, or offline operations.

Existing sign-out, access revocation and inspection-lock transitions remain security
boundaries, distinct from optional application updates. Legacy open documents acquire
the new behavior only after loading this release. Browser/OS termination is outside
this mechanism; universal automatic draft recovery is not implemented.

## Verification

Run `vitest run tests/updates` and relevant workflow tests, then `npm run check`.
For browser verification, use isolated synthetic fixtures: keep dirty editors in two
tabs on build A, serve build B without A's unloaded chunks, defer/reopen the notice,
save one tab and explicitly restart it, and verify the other tab keeps its draft.
Also exercise failed preflight, missing chunks, pristine/edited product details,
loaded legal drafts and mobile notification placement.
