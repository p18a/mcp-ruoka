import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerSearchTool } from "./tools/search.ts";
import { registerStoresTool } from "./tools/stores.ts";

function createServer(): McpServer {
	const server = new McpServer({
		name: "k-ruoka",
		version: "0.1.0",
	});
	registerSearchTool(server);
	registerStoresTool(server);
	return server;
}

const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

function getTransport(
	sessionId: string | null,
): WebStandardStreamableHTTPServerTransport | undefined {
	if (!sessionId) return undefined;
	return transports.get(sessionId);
}

const port = Number(process.env.PORT) || 3001;
const authToken = process.env.MCP_AUTH_TOKEN;

if (!authToken) {
	console.warn("WARNING: MCP_AUTH_TOKEN not set — running without authentication");
}

function checkAuth(req: Request): boolean {
	if (!authToken) return true;
	const header = req.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const token = header.slice(7);
	if (token.length !== authToken.length) return false;
	return timingSafeEqual(Buffer.from(token), Buffer.from(authToken));
}

Bun.serve({
	port,
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname !== "/mcp") {
			return new Response("Not Found", { status: 404 });
		}

		if (!checkAuth(req)) {
			return new Response(null, { status: 401 });
		}

		const sessionId = req.headers.get("mcp-session-id");

		if (req.method === "POST") {
			const existing = getTransport(sessionId);
			if (existing) {
				return existing.handleRequest(req);
			}

			// Session ID was provided but not found — session is stale (e.g. server restarted).
			// Per MCP spec, return 404 so the client knows to re-initialize.
			if (sessionId) {
				return Response.json(
					{ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null },
					{ status: 404 },
				);
			}

			const body = await req.json();
			if (isInitializeRequest(body)) {
				const transport = new WebStandardStreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (sid) => {
						transports.set(sid, transport);
					},
				});
				transport.onclose = () => {
					if (transport.sessionId) {
						transports.delete(transport.sessionId);
					}
				};

				const server = createServer();
				await server.connect(transport);

				const newReq = new Request(req.url, {
					method: req.method,
					headers: req.headers,
					body: JSON.stringify(body),
				});
				return transport.handleRequest(newReq);
			}

			return Response.json(
				{ jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: null },
				{ status: 400 },
			);
		}

		if (req.method === "GET" || req.method === "DELETE") {
			const transport = getTransport(sessionId);
			if (transport) {
				return transport.handleRequest(req);
			}
			return Response.json(
				{ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null },
				{ status: sessionId ? 404 : 400 },
			);
		}

		return new Response("Method Not Allowed", { status: 405 });
	},
});

console.log(`K-Ruoka MCP server listening on http://localhost:${port}/mcp`);
