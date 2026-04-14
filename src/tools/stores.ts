import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getStores } from "../browser/scraper.ts";

export function registerStoresTool(server: McpServer): void {
	server.registerTool(
		"get_stores",
		{
			description:
				"List available K-Ruoka stores. Returns store IDs needed for search_products. Always call this first to get a valid storeId before searching.",
			inputSchema: z.object({
				city: z
					.string()
					.optional()
					.describe("Filter stores by city name (e.g., 'Helsinki', 'Tampere')"),
			}),
		},
		async ({ city }) => {
			try {
				const stores = await getStores(city);
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(stores, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error fetching stores: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
