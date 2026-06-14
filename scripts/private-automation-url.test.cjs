const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertPrivateAutomationServiceUrl,
  isPrivateAutomationUrl,
} = require("./lib/private-automation-url.cjs");

test("accepts railway.internal automation URLs", () => {
  assert.equal(
    assertPrivateAutomationServiceUrl(
      "http://automation-service.railway.internal:8000",
      {
        consumerName: "transcription-worker",
      },
    ),
    "http://automation-service.railway.internal:8000",
  );
  assert.equal(
    isPrivateAutomationUrl("http://automation-service.railway.internal:8000"),
    true,
  );
});

test("rejects public automation-service URLs", () => {
  assert.throws(
    () =>
      assertPrivateAutomationServiceUrl(
        "https://automation-service-production.up.railway.app",
        {
          consumerName: "clip-worker",
        },
      ),
    /AUTOMATION_SERVICE_URL must use http private networking/,
  );
  assert.equal(
    isPrivateAutomationUrl(
      "https://automation-service-production.up.railway.app",
    ),
    false,
  );
});
