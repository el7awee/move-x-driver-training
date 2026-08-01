import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(
  await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);

function onlyD1(environment, label) {
  assert.equal(environment.d1_databases?.length, 1, `${label} must define exactly one D1 database`);
  return environment.d1_databases[0];
}

test("Wrangler keeps production and staging resources isolated", () => {
  const productionD1 = onlyD1(config, "production");
  const staging = config.env?.staging;
  assert.ok(staging, "env.staging must exist");
  const stagingD1 = onlyD1(staging, "staging");

  assert.equal(config.name, "move-x-driver-training");
  assert.equal(productionD1.binding, "DB");
  assert.equal(productionD1.database_name, "move-x-driver-training-production");
  assert.notEqual(productionD1.database_name, "move-x-driver-training-staging");
  assert.notEqual(config.vars?.IDENTITY_STAGING_VALIDATION, "true");

  assert.equal(staging.name, "move-x-driver-training-staging");
  assert.equal(stagingD1.binding, "DB");
  assert.equal(stagingD1.database_name, "move-x-driver-training-staging");
  assert.notEqual(stagingD1.database_name, "move-x-driver-training-production");
  assert.equal(staging.vars?.IDENTITY_STAGING_VALIDATION, "true");

  assert.notEqual(productionD1.database_id, stagingD1.database_id);
  assert.equal(config.assets?.directory, "dist/client");
  assert.equal(staging.assets?.directory, "dist/client");
});
