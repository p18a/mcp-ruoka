export type Chain = "k-ruoka" | "s-kaupat" | "alko";

export interface Product {
	name: string;
	price: number | null;
	unitPrice: string | null;
	id: string;
	imageUrl: string | null;
	brand: string | null;
	category: string | null;
	abv?: number | null;
}

export interface Store {
	id: string;
	name: string;
	chain: Chain;
	location: string;
}

export interface SearchResult {
	products: Product[];
	totalCount: number;
	query: string;
	storeId: string | null;
	chain: Chain;
}
