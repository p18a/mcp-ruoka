import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { searchProducts } from "../browser/scraper.ts";

export function registerSearchTool(server: McpServer): void {
	server.registerTool(
		"search_products",
		{
			description: "Search for grocery products on K-Ruoka (k-ruoka.fi) filtered by store location",
			inputSchema: z.object({
				query: z.string().min(1).describe("Search query for products (e.g., 'maito', 'leipä')"),
				storeId: z.string().describe("Store identifier (use get_stores to discover store IDs)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.optional()
					.default(10)
					.describe("Maximum number of results to return (default: 10, max: 50)"),
			}),
		},
		async ({ query, storeId, limit }) => {
			try {
				const result = await searchProducts(query, storeId, limit);
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error searching products: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
