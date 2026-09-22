import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkbenchStore } from "../src/store.mjs";

test("records remain isolated to their owner", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ai-ceo-os-"));
  const store = new WorkbenchStore(join(directory, "test.sqlite"));
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const owner = await store.createOwner("owner", "test-hash");
  const record = store.createRecord(owner.id, { title: "Review weekly metrics" });
  assert.equal(record.title, "Review weekly metrics");
  assert.equal(store.listRecords(owner.id).length, 1);
  assert.equal(store.listRecords(owner.id + 1).length, 0);
});
