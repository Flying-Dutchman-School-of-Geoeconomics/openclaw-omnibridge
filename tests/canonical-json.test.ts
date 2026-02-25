import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson } from "../src/core/canonical-json.js";

test("canonicalJson sorts keys deterministically", () => {
  const a = canonicalJson({ z: 1, a: 2, nested: { b: 1, a: 2 } });
  const b = canonicalJson({ a: 2, nested: { a: 2, b: 1 }, z: 1 });
  assert.equal(a, b);
});
