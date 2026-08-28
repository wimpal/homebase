import { DomainError } from "@/domain/error";

export function verifyBearerAuth(request: Request): boolean {
  const expected = process.env.SERVICE_TOKEN?.trim();
  if (!expected) {
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header) {
    return false;
  }

  return header === `Bearer ${expected}`;
}

export function resolveMcpHouseholdId(): string | DomainError {
  const householdId = process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    return DomainError.unavailable(
      "MCP is not configured: set MCP_HOUSEHOLD_ID in the environment.",
    );
  }
  return householdId;
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function unavailableResponse(message: string): Response {
  return new Response(
    JSON.stringify({ error: { code: "unavailable", message, retryable: true } }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}
