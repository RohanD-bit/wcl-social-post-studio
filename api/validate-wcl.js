import { formatValidationError, validateSubmission } from "./wcl-validation-core.js";

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ status: "error", summary: "Use POST for WCL validation." });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = await validateSubmission(body.submission ?? body);
    response.status(200).json(result);
  } catch (error) {
    response.status(200).json(formatValidationError(error));
  }
}
