// Row ids in this app are Postgres `uuid`s. A query comparing a `uuid` column to
// anything else fails with `invalid input syntax for type uuid` (22P02), so a
// mistyped or truncated id in a URL would surface as a 500 carrying a database
// error, when what it means is "no such row". Services check the shape first
// and answer "not found" instead.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
