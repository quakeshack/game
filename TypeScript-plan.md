# Game Code TypeScript Port

Here are a bunch of considerations when porting the game code from JavaScript to TypeScript:

- Consider the general TypeScript port instructions
- Start with BaseEntity.mjs
- Make use of annotations to replace the old Serializer reflection logic (startFields, endFields) to make the source easier to read and understand
- Be aware of `this` on the state machine logic, the current linter will complain about missing methods etc., because the functions are defined from the static method (_defineState), but their executions will be wired to the entity in question
- There might be lots of places where the use of generics would make sense, keep an eye open
