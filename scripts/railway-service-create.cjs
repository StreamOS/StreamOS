#!/usr/bin/env node

const endpoint = "https://backboard.railway.com/graphql/v2";
const token = process.env.RAILWAY_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
const serviceName = process.env.SERVICE_NAME;

if (!token) {
  throw new Error("RAILWAY_TOKEN is required.");
}

if (!projectId) {
  throw new Error("RAILWAY_PROJECT_ID is required.");
}

if (!serviceName) {
  throw new Error("SERVICE_NAME is required.");
}

const createService = async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "mutation serviceCreate($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }",
      variables: {
        input: {
          name: serviceName,
          projectId,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok || payload.errors?.length > 0) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`Railway serviceCreate failed: ${message}`);
  }

  const service = payload.data?.serviceCreate;

  if (!service?.id || service?.name !== serviceName) {
    throw new Error("Railway serviceCreate returned an unexpected payload.");
  }

  process.stdout.write(JSON.stringify(service));
};

createService().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
