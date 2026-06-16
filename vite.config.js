import { formatValidationError, validateSubmission } from "./api/wcl-validation-core.js";

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function localWclApi() {
  return {
    name: "local-wcl-validation-api",
    configureServer(server) {
      server.middlewares.use("/api/validate-wcl", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { status: "error", summary: "Use POST for WCL validation." });
          return;
        }

        try {
          const body = JSON.parse((await readRequestBody(request)) || "{}");
          const result = await validateSubmission(body.submission ?? body);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, 200, formatValidationError(error));
        }
      });
    },
  };
}

export default {
  plugins: [localWclApi()],
};
