import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  resolveMcpHouseholdId,
  unauthorizedResponse,
  unavailableResponse,
  verifyBearerAuth,
} from "@/mcp/auth";
import { createMcpServer } from "@/mcp/server";
import { isDomainError } from "@/domain/error";

async function handleMcpRequest(request: Request): Promise<Response> {
  if (!verifyBearerAuth(request)) {
    return unauthorizedResponse();
  }

  const householdId = resolveMcpHouseholdId();
  if (isDomainError(householdId)) {
    return unavailableResponse(householdId.message);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(householdId);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
