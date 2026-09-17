import assert from "node:assert/strict";
import test from "node:test";
import { privacyMetadata } from "./privacy.ts";

test("privacy metadata describes no application server-side history and deployment-dependent hosting", () => {
  assert.match(privacyMetadata.sourceProcessing, /not written to an application database or server-side history/i);
  assert.match(privacyMetadata.sourceProcessing, /\/api\/analyze, \/api\/coach, or \/api\/project\/analyze/i);
  assert.match(privacyMetadata.resultHandling, /\/api\/report/i);
  assert.match(privacyMetadata.resultHandling, /does not persist the report object server-side/i);
  assert.match(privacyMetadata.retention, /no server-side analysis-history or report-retention/i);
  assert.match(privacyMetadata.retention, /client IP address and request count only for its configured window/i);
  assert.match(privacyMetadata.execution, /removed after the run/i);
  assert.match(privacyMetadata.deployment.localSelfHosted, /configured server/i);
  assert.match(privacyMetadata.deployment.publicHosted, /public hosted API/i);
});

test("privacy metadata states browser retention and local companion boundaries", () => {
  assert.match(privacyMetadata.browserHistory, /ecodev-history/);
  assert.match(privacyMetadata.browserHistory, /12-entry limit/i);
  assert.match(privacyMetadata.companion, /127\.0\.0\.1/);
  assert.match(privacyMetadata.freeToUse, /do not require paid API keys/i);
});
