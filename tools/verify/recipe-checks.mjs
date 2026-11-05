// Behavioural checks for `run` recipes, keyed by the first name in the block's id=.
// Each entry: { check(fn, env), mutants: [fn, ...] }. `check` runs in the page after the recipe's
// block loads; it throws (or returns false) to fail. Gate 2 requires `check` to pass on the
// documented recipe and to fail on every mutant. Every entry needs a `run` block with a matching id=.
export default {}
