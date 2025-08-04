/** biome-ignore-all lint/style/noNonNullAssertion: <explanation> */
// import * as R from "ramda";
import type { Knex } from "knex";
import {
	filterByType,
	groupBy,
	hasIntersection,
	pipe,
	someWithIndex,
} from "./pipe.js";
import { getVarId, isVar } from "./sql-logic.js";
import type {
	ColumnInfo,
	ColumnValue,
	ConstraintInfo,
	GoalInfo,
	OrConstraintInfo,
	PredicateInfo,
	UnionInfo,
} from "./types.js";

type QueryBuilder = Knex.QueryBuilder;

const createWhereClause =
	(
		alias: string,
		column: string,
		operator: string,
		value: ColumnValue | ColumnValue[],
	) =>
	(qb: QueryBuilder) => {
		const columnRef = `${alias}.${column}`;
		const processedValue =
			(operator === "IN" || operator === "NOT IN") && !Array.isArray(value)
				? [value]
				: value;

		if (operator === "IN") {
			return qb.whereIn(columnRef, processedValue as readonly ColumnValue[]);
		}
		if (operator === "NOT IN") {
			return qb.whereNotIn(columnRef, processedValue as readonly ColumnValue[]);
		}
		return qb.where(columnRef, processedValue);
	};

const createOrWhereClause = (
	alias: string,
	column: string,
	operator: string,
	value: ColumnValue | ColumnValue[],
) =>
	function (this: Knex.QueryBuilder) {
		const columnRef = `${alias}.${column}`;
		const processedValue =
			(operator === "IN" || operator === "NOT IN") && !Array.isArray(value)
				? [value]
				: value;

		if (operator === "IN") {
			this.orWhereIn(columnRef, processedValue as readonly ColumnValue[]);
		} else if (operator === "NOT IN") {
			this.orWhereNotIn(columnRef, processedValue as readonly ColumnValue[]);
		} else {
			this.orWhere(columnRef, processedValue);
		}
	};

const applyQueryModifiers = (
	qb: QueryBuilder,
	modifiers: Array<(qb: QueryBuilder) => QueryBuilder>,
) => modifiers.reduce((acc, modifier) => modifier(acc), qb);

export function applySelects(selectColumns: VarLocation[]) {
	return (qb: QueryBuilder) =>
		selectColumns.length > 0
			? qb.select(
					selectColumns.map((s) => `${s.alias}.${s.column} as ${s.varName}`),
				)
			: qb;
}

export function applyJoins(
	varLocations: Record<
		string,
		{ alias: string; table: string; column: string }[]
	>,
): (qb: QueryBuilder) => QueryBuilder {
	return (qb: QueryBuilder) => {
		return pipe(
			Object.values(varLocations),
			(locations) => locations.filter((locs) => locs.length > 1),
			(locations) =>
				locations.flatMap((locs) =>
					locs.flatMap((t1, i) =>
						locs.slice(i + 1).map((t2) => ({
							t1,
							t2,
							pairKey: [t1.alias, t2.alias].sort().join("::"),
						})),
					),
				),
			(pairs) =>
				pairs.reduce(
					(acc, { t1, t2, pairKey }) => {
						if (!acc.seen.has(pairKey)) {
							acc.pairs.push([t1, t2]);
							acc.seen.add(pairKey);
						}
						return acc;
					},
					{
						pairs: [] as Array<
							[(typeof pairs)[0]["t1"], (typeof pairs)[0]["t2"]]
						>,
						seen: new Set<string>(),
					},
				),
			(result) => result.pairs,
			(pairs) =>
				pairs.reduce(
					(builder, [t1, t2]) =>
						builder.join({ [t2.alias]: t2.table }, function () {
							this.on(
								`${t1.alias}.${t1.column}`,
								"=",
								`${t2.alias}.${t2.column}`,
							);
						}),
					qb,
				),
		);
	};
}

export function applyPredicateWheres(predicates: PredicateInfo[]) {
	return (qb: QueryBuilder) => {
		const modifiers = predicates
			.filter((pred) => pred.alias)
			.flatMap((pred) =>
				pred.columns
					.filter(
						(col): col is ColumnInfo & { value: ColumnValue } =>
							!isVar(col.value),
					)
					.map((col) =>
						createWhereClause(pred.alias!, col.column, col.operator, col.value),
					),
			);

		return applyQueryModifiers(qb, modifiers);
	};
}

export function applyOrConstraint(
	qb: QueryBuilder,
	or: OrConstraintInfo,
	varLocations: Record<
		string,
		{ alias: string; table: string; column: string }[]
	>,
): QueryBuilder {
	const orClauses = or.clauses.flatMap((clause) => {
		const varId = getVarId(clause.variable);
		const locs = varId ? varLocations[varId] || [] : [];
		return locs.map((loc) =>
			createOrWhereClause(loc.alias, loc.column, clause.operator, clause.value),
		);
	});

	return qb.where(function () {
		orClauses.forEach((orClause) => orClause.call(this));
	});
}

export function applyAllOrConstraints(
	orConstraints: OrConstraintInfo[],
	varLocations: Record<
		string,
		{ alias: string; table: string; column: string }[]
	>,
) {
	return (qb: QueryBuilder) =>
		orConstraints.reduce(
			(acc, or) => acc.modify((q) => applyOrConstraint(q, or, varLocations)),
			qb,
		);
}

interface VarLocation {
	varId: string;
	alias: string;
	table: string;
	column: string;
	varName: string;
}

function splitGoals(goals: GoalInfo[]) {
	const flattenGoals = (goals: GoalInfo[]): GoalInfo[] =>
		goals.flatMap((g) =>
			g.type === "union"
				? g.queries.flatMap((branch) =>
						flattenGoals(Array.isArray(branch) ? branch : [branch]),
					)
				: [g],
		);

	const allGoals = flattenGoals(goals);

	return {
		predicates: filterByType(allGoals, "predicate"),
		constraints: filterByType(allGoals, "constraint"),
		orConstraints: filterByType(allGoals, "or_constraint"),
		unions: filterByType(goals, "union"),
	};
}

const makePredicateWithAliases = (predicates: PredicateInfo[]) =>
	predicates.map((pred, i) => ({
		...pred,
		alias: `t${i + 1}`,
	}));

const makeSelectColumns = (varLocations: Record<string, VarLocation[]>) =>
	Object.values(varLocations)
		.map((locations) => locations[0])
		.filter((location): location is VarLocation => location != null);

const createVarLocation = (
	pred: PredicateInfo,
	col: ColumnInfo,
): VarLocation | null => {
	const varId = getVarId(col.value);
	return varId && pred.alias
		? {
				varId,
				alias: pred.alias,
				table: pred.table,
				column: col.column,
				varName: (col.value as { name: string }).name,
			}
		: null;
};

const extractVarLocationsFromPredicate = (pred: PredicateInfo): VarLocation[] =>
	pred.columns
		.filter((col) => isVar(col.value))
		.map((col) => createVarLocation(pred, col))
		.filter((x): x is VarLocation => x !== null);

const makeVarLocations = (predicates: PredicateInfo[]) =>
	pipe(
		predicates,
		(preds) => preds.flatMap(extractVarLocationsFromPredicate),
		(locations) => groupBy(locations, (loc) => loc.varId),
	);

function arePredicatesDisconnected(predicates: PredicateInfo[]) {
	const varSets = predicates.map(
		(pred) =>
			new Set(
				pred.columns
					.filter((c) => isVar(c.value))
					.map((c) => getVarId(c.value)),
			),
	);

	const hasSharedVariable = someWithIndex(varSets, (set1, i) =>
		varSets.slice(i + 1).some((set2) => hasIntersection(set1, set2)),
	);

	return predicates.length > 1 && !hasSharedVariable;
}

const applyCrossJoinsIfDisconnected =
	(predicates: PredicateInfo[]) => (qb: QueryBuilder) =>
		!arePredicatesDisconnected(predicates)
			? qb
			: predicates.slice(1).reduce(
					(acc, pred) =>
						acc.join(`${pred.table} as ${pred.alias!}`, () => {
							// Empty function creates a cross join (no ON clause)
						}),
					qb,
				);

function applyUnions(unions: UnionInfo[], knex: Knex) {
	return (qb: QueryBuilder) => {
		if (unions.length === 0) return qb;

		// Build all union subqueries
		const subqueries = unions.flatMap((unionInfo) =>
			unionInfo.queries.map((subGoals) =>
				buildKnexQueryFromGoals(
					knex,
					Array.isArray(subGoals) ? subGoals : [subGoals],
				),
			),
		);

		if (subqueries.length === 0) return qb;

		// Use the array form of union to add all subqueries at once
		return qb.union(subqueries);
	};
}

function handleEmptyPredicates(): never {
	throw new Error(
		"No goals provided - cannot build query without predicates or unions",
	);
}

const createConstraintPipeline =
	<T>(
		getVarId: (item: T) => string | null,
		createModifier: (loc: any, item: T) => (qb: QueryBuilder) => QueryBuilder,
	) =>
	(items: T[], varLocations: Record<string, any[]>) =>
	(qb: QueryBuilder) => {
		const modifiers = flatMapLocations(
			items,
			getVarId,
			varLocations,
			createModifier,
		);
		return applyQueryModifiers(qb, modifiers);
	};

const flatMapLocations = <T>(
	items: T[],
	getVarId: (item: T) => string | null,
	varLocations: Record<string, any[]>,
	createClause: (loc: any, item: T) => any,
) =>
	items.flatMap((item) => {
		const locs = getVariableLocations(getVarId(item), varLocations);
		return locs.map((loc) => createClause(loc, item));
	});

const getVariableLocations = (
	varId: string | null,
	varLocations: Record<string, any[]>,
) => (varId ? varLocations[varId] || [] : []);

const applyWhereConstraints = createConstraintPipeline(
	(constraint: ConstraintInfo) => getVarId(constraint.variable),
	(loc, constraint: ConstraintInfo) =>
		createWhereClause(
			loc.alias,
			loc.column,
			constraint.operator,
			constraint.value,
		),
);

export function buildKnexQueryFromGoals(
	knex: Knex,
	goals: GoalInfo[],
): QueryBuilder {
	// Handle single union in array - use knex.union directly
	if (goals.length === 1 && goals[0]!.type === "union") {
		const union = goals[0] as UnionInfo;
		const subqueries = union.queries.map((subGoals) =>
			buildKnexQueryFromGoals(
				knex,
				Array.isArray(subGoals) ? subGoals : [subGoals],
			),
		);
		return knex.union(subqueries);
	}

	// Handle regular goals pipeline
	const { predicates, constraints, orConstraints, unions } = splitGoals(goals);
	const predicatesWithAliases = makePredicateWithAliases(predicates);

	// Handle case where there are no predicates
	if (predicatesWithAliases.length === 0) {
		handleEmptyPredicates();
	}

	const varLocations = makeVarLocations(predicatesWithAliases);
	const selectColumns = makeSelectColumns(varLocations);

	const baseQuery = knex({
		[predicatesWithAliases[0]!.alias]: predicatesWithAliases[0]!.table,
	});

	return pipe(
		baseQuery,
		applyCrossJoinsIfDisconnected(predicatesWithAliases),
		applySelects(selectColumns),
		applyJoins(varLocations),
		applyWhereConstraints(constraints, varLocations),
		applyPredicateWheres(predicatesWithAliases),
		applyAllOrConstraints(orConstraints, varLocations),
		applyUnions(unions, knex),
	);
}
