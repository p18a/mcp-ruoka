import type { Product, SearchResult, Store } from "../types.ts";
import { getBuildNumber, getPage, resetSession } from "./session.ts";

interface ApiProduct {
	id: string;
	product: {
		ean: string;
		localizedName: { finnish: string };
		images?: string[];
		mobilescan?: {
			pricing?: {
				normal?: {
					price: number;
					unitPrice?: { value: number; unit: string; contentSize: number };
				};
			};
		};
		brand?: { name: string };
		category?: {
			localizedName?: { finnish: string };
		};
	};
}

interface ApiSearchResponse {
	result?: ApiProduct[];
	error?: { message: string };
}

interface ApiStore {
	id: string;
	name: string;
	chain: string;
	chainName: string;
	location: string;
	isWebStore: boolean;
}

interface ApiStoresResponse {
	results?: ApiStore[];
}

function parseProduct(item: ApiProduct): Product {
	const p = item.product;
	const pricing = p.mobilescan?.pricing?.normal;
	const unitPrice = pricing?.unitPrice;

	return {
		name: p.localizedName.finnish,
		price: pricing?.price ?? null,
		unitPrice: unitPrice
			? `${unitPrice.value.toFixed(2).replace(".", ",")} €/${unitPrice.unit}`
			: null,
		ean: p.ean,
		imageUrl: p.images?.[0] ?? null,
		brand: p.brand?.name ?? null,
		category: p.category?.localizedName?.finnish ?? null,
	};
}

async function fetchSearchApi(
	query: string,
	storeId: string,
	limit: number,
): Promise<ApiSearchResponse> {
	const page = await getPage();
	const buildNumber = getBuildNumber();

	return (await page.evaluate(
		async ({
			query,
			storeId,
			limit,
			buildNumber,
		}: {
			query: string;
			storeId: string;
			limit: number;
			buildNumber: string;
		}) => {
			const params = new URLSearchParams({
				offset: "0",
				language: "fi",
				storeId,
				limit: String(limit),
				discountFilter: "false",
				isTosTrOffer: "false",
			});
			const res = await fetch(`/kr-api/v2/product-search/${encodeURIComponent(query)}?${params}`, {
				method: "POST",
				headers: {
					accept: "application/json",
					"x-k-build-number": buildNumber,
				},
			});
			const body = await res.text();
			if (res.status === 403 || body.includes("cf-challenge")) {
				return { _blocked: true, _status: res.status, _body: body };
			}
			return JSON.parse(body);
		},
		{ query, storeId, limit, buildNumber },
	)) as ApiSearchResponse & { _blocked?: boolean; _status?: number; _body?: string };
}

export async function searchProducts(
	query: string,
	storeId: string,
	limit: number,
): Promise<SearchResult> {
	let data = await fetchSearchApi(query, storeId, limit);

	// Detect Cloudflare block and retry once after reset
	const raw = data as ApiSearchResponse & {
		_blocked?: boolean;
		_status?: number;
		_body?: string;
	};
	if (raw._blocked) {
		await resetSession();
		data = await fetchSearchApi(query, storeId, limit);
		const retry = data as typeof raw;
		if (retry._blocked) {
			throw new Error("Blocked by Cloudflare after session reset");
		}
	}

	if (data.error) {
		throw new Error(`K-Ruoka API error: ${data.error.message}`);
	}

	const products = (data.result ?? []).map(parseProduct);

	return {
		products,
		totalCount: products.length,
		query,
		storeId,
	};
}

async function fetchStoresApi(): Promise<ApiStoresResponse> {
	const page = await getPage();

	return (await page.evaluate(async () => {
		const res = await fetch("/kr-api/stores");
		const body = await res.text();
		if (res.status === 403 || body.includes("cf-challenge")) {
			return { _blocked: true, _status: res.status, _body: body };
		}
		return JSON.parse(body);
	})) as ApiStoresResponse & { _blocked?: boolean; _status?: number; _body?: string };
}

export async function getStores(city?: string): Promise<Store[]> {
	let data = await fetchStoresApi();

	// Detect Cloudflare block and retry once after reset
	const raw = data as ApiStoresResponse & { _blocked?: boolean };
	if (raw._blocked) {
		await resetSession();
		data = await fetchStoresApi();
		const retry = data as typeof raw;
		if (retry._blocked) {
			throw new Error("Blocked by Cloudflare after session reset");
		}
	}

	let stores = (data.results ?? [])
		.filter((s) => s.isWebStore)
		.map((s) => ({
			id: s.id,
			name: s.name,
			chain: s.chainName,
			location: s.location,
		}));

	if (city) {
		const lower = city.toLowerCase();
		stores = stores.filter((s) => s.location.toLowerCase().includes(lower));
	}

	return stores;
}
