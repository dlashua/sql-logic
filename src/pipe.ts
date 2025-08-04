// Pipe function with proper TypeScript overloads
export function pipe<T>(value: T): T;
export function pipe<T, R1>(value: T, fn1: (arg: T) => R1): R1;
export function pipe<T, R1, R2>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
): R2;
export function pipe<T, R1, R2, R3>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
): R3;
export function pipe<T, R1, R2, R3, R4>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
	fn4: (arg: R3) => R4,
): R4;
export function pipe<T, R1, R2, R3, R4, R5>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
	fn4: (arg: R3) => R4,
	fn5: (arg: R4) => R5,
): R5;
export function pipe<T, R1, R2, R3, R4, R5, R6>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
	fn4: (arg: R3) => R4,
	fn5: (arg: R4) => R5,
	fn6: (arg: R5) => R6,
): R6;
export function pipe<T, R1, R2, R3, R4, R5, R6, R7>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
	fn4: (arg: R3) => R4,
	fn5: (arg: R4) => R5,
	fn6: (arg: R5) => R6,
	fn7: (arg: R6) => R7,
): R7;
export function pipe<T, R1, R2, R3, R4, R5, R6, R7, R8>(
	value: T,
	fn1: (arg: T) => R1,
	fn2: (arg: R1) => R2,
	fn3: (arg: R2) => R3,
	fn4: (arg: R3) => R4,
	fn5: (arg: R4) => R5,
	fn6: (arg: R5) => R6,
	fn7: (arg: R6) => R7,
	fn8: (arg: R7) => R8,
): R8;
export function pipe(value: any, ...fns: Array<(arg: any) => any>): any {
	return fns.reduce((acc, fn) => fn(acc), value);
}

// Array utilities
export const filterByType = <T extends { type: string }, K extends T["type"]>(
	items: T[],
	type: K,
): Extract<T, { type: K }>[] =>
	items.filter((item): item is Extract<T, { type: K }> => item.type === type);

export const groupBy = <T, K extends string | number | symbol>(
	items: T[],
	keyFn: (item: T) => K,
): Record<K, T[]> =>
	items.reduce(
		(acc, item) => {
			const key = keyFn(item);
			return { ...acc, [key]: [...(acc[key] || []), item] };
		},
		{} as Record<K, T[]>,
	);

export const mapWithIndex = <T, R>(
	items: T[],
	fn: (item: T, index: number) => R,
): R[] => items.map(fn);

// Object utilities
export const mapValues = <T, R>(
	obj: Record<string, T>,
	fn: (value: T) => R,
): Record<string, R> =>
	Object.fromEntries(
		Object.entries(obj).map(([key, value]) => [key, fn(value)]),
	);

export const pickBy = <T>(
	obj: Record<string, T>,
	predicate: (value: T, key: string) => boolean,
): Record<string, T> =>
	Object.fromEntries(
		Object.entries(obj).filter(([key, value]) => predicate(value, key)),
	);

// Set utilities
export const hasIntersection = <T>(set1: Set<T>, set2: Set<T>): boolean =>
	Array.from(set1).some((item) => set2.has(item));

export const someWithIndex = <T>(
	items: T[],
	predicate: (item: T, index: number) => boolean,
): boolean => items.some(predicate);
