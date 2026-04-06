# Game Code TypeScript Port

Here are a bunch of considerations when porting the game code from JavaScript to TypeScript:

- Consider the general TypeScript port instructions
- Start with BaseEntity.mjs
- Make use of annotations to replace the old Serializer reflection logic (startFields, endFields) to make the source easier to read and understand
- Be aware of `this` on the state machine logic, the current linter will complain about missing methods etc., because the functions are defined from the static method (_defineState), but their executions will be wired to the entity in question
- There might be lots of places where the use of generics would make sense, keep an eye open

## Porting steps

For each gameplay file or monster port, follow this order:

1. Read the existing JavaScript implementation end-to-end.
	- Understand the runtime behavior first.
	- Identify serializer fields, state machine setup, spawn/precache hooks, attack logic, and any special cases.
	- Check nearby call sites and registry wiring so the TS port fits the current integration points.

2. Stay within the porting guidelines and use a good existing TS port as the style reference.
	- Follow the general TypeScript port instructions.
	- Prefer the established style from good ports such as Dog.ts.
	- Use typed fields, native TS access modifiers, `override`, and the decorator-based serializer annotations where appropriate.
	- Preserve maintainability and readability over mechanically translating old JS patterns.

3. Compare the implementation with the original Quake logic for obvious flaws.
	- Use the original QC source as the behavioral reference.
	- Look for clear mismatches, missing states, incorrect transitions, wrong sounds/events, or behavior that drifted during the JS port.
	- Do not introduce speculative behavior changes, but do fix obvious logic drift when the original code makes the intent clear.

4. Write a focused unit test for the current JavaScript behavior before porting.
	- Build a regression harness around the existing JS implementation first.
	- Lock down metadata, state machine structure, important transitions, and any bug-prone behavior.
	- If a QC mismatch is going to be corrected intentionally, add a test that documents that intended behavior as well.

5. Port the code to TypeScript with developer experience in mind.
	- Prefer rethinking awkward JS constructs instead of adding noise only to satisfy `tsc`.
	- Avoid unnecessary helper wrappers, reflective access, or defensive constructions when the runtime contract is already clear.
	- Use local assertions, direct types, and clearer state/sequence data when that produces simpler code.
	- For monsters, prefer the sequence-driven style used in Dog.ts, Soldier.ts, Ogre.ts, and Demon.ts over long manual `_defineState(...)` chains when practical.
	- Replace legacy serializer reflection (`startFields`, `endFields`) with annotations when possible.
  - Always port comments! Especially JSDoc comments and comments explaining some oddity or a deliberate design decision!

6. Keep compatibility wiring intact while the migration is in progress.
	- Keep `.mjs` compatibility shims that re-export the `.ts` implementation.
	- Update TS entry points to import the `.ts` module directly where that is already the project pattern.
	- Preserve public behavior and surrounding APIs unless there is a deliberate, tested correction.
	- Treat `.mjs` shims as transitional compatibility only.
	- The long-term goal is to remove all `.mjs` shims once the surrounding code has been ported and direct `.ts` imports are safe everywhere.

7. Re-run the tests immediately after the port.
	- Run the focused unit tests for the file you changed.
	- Fix regressions before moving on.
	- Prefer targeted verification first, then broader checks as needed.

8. Ensure that everything still works like before.
	- Confirm the TS port preserves the established runtime behavior.
	- Confirm any intentional behavior changes are backed by the original logic and covered by tests.
	- Run linting on the touched files and check for new diagnostics.

9. Leave the file in a better state than before.
	- Reduce legacy JS-era complexity where it improves clarity.
	- Keep the code pleasant to work on for both humans and AI agents.
	- Do not brute-force the compiler into silence; make the implementation itself clearer.

Practical short version:

1. Read the JS file.
2. Compare against a good TS example and the original QC logic.
3. Write a regression test for the JS implementation.
4. Port to TS cleanly.
5. Re-run tests.
6. Verify behavior parity and compatibility wiring.

