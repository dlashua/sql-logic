import knex from "knex";
import { nanoid } from "nanoid";
import { buildKnexQueryFromGoals } from "./sql-logic-utils.js";
import type {
	ColumnValue,
	ConstraintInfo,
	GoalInfo,
	OrConstraintInfo,
	PredicateInfo,
	SqlLogicOptions,
	UnionInfo,
	Var,
} from "./types.js";

export function isVar(v: unknown): v is Var {
	if (
		v &&
		typeof v === "object" &&
		v !== null &&
		"type" in v &&
		(v as { type: string }).type === "var"
	) {
		return true;
	}
	return false;
}

export function getVarId(v: unknown) {
	if (isVar(v)) {
		return v.id;
	}
	return null;
}

export class SqlLogic {
	#db: import("knex").Knex;
	#logSql: boolean = true;
	#vars: Map<string, Var> = new Map();

	constructor(options: SqlLogicOptions) {
		this.#db = knex(options.db);
		this.#logSql = options.logSql ?? false;
	}

	table(name: string) {
		return function query(
			obj: Record<string, ColumnValue | Var>,
		): PredicateInfo {
			return {
				type: "predicate" as const,
				table: name,
				columns: Object.entries(obj).map(([column, value]) => ({
					column,
					operator: "=",
					value,
				})),
			};
		};
	}

	query(...goals: Array<GoalInfo | GoalInfo[]>): GoalInfo[] {
		return this.conj(...goals);
	}

	var(name?: string): Var {
		const id = nanoid();
		name ??= id;
		const thisVar = {
			type: "var" as const,
			id,
			name,
		};
		this.#vars.set(id, thisVar);
		return thisVar;
	}

	async runToArray(goals: GoalInfo[]): Promise<any[]> {
		const kQuery = buildKnexQueryFromGoals(this.#db, goals);
		if (this.#logSql) {
			console.log(`[SQL] ${kQuery.toString()}`);
		}
		return await kQuery;
	}

	conj(...goals: Array<GoalInfo | GoalInfo[]>): GoalInfo[] {
		return goals.flatMap((g) => (Array.isArray(g) ? g : [g]));
	}

	disj(...goals: GoalInfo[]): UnionInfo {
		return {
			type: "union",
			queries: goals,
		};
	}

	// CONSTRAINTS
	orConstraint(clauses: ConstraintInfo[]) {
		return {
			type: "or_constraint" as const,
			clauses,
		};
	}

	gt(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: ">",
			value,
		};
	}

	gte(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: ">=",
			value,
		};
	}

	lt(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: "<",
			value,
		};
	}

	lte(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: "<=",
			value,
		};
	}

	neq(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: "!=",
			value,
		};
	}

	eq(variable: Var, value: ColumnValue) {
		return {
			type: "constraint" as const,
			variable,
			operator: "=",
			value,
		};
	}

	in(variable: Var, value: ColumnValue[]) {
		return {
			type: "constraint" as const,
			variable,
			operator: "IN",
			value,
		};
	}

	notIn(variable: Var, value: ColumnValue[]) {
		return {
			type: "constraint" as const,
			variable,
			operator: "NOT IN",
			value,
		};
	}
}
// Type guards
export function isTypedObject(obj: unknown): obj is { type: string } {
	if (
		obj &&
		obj !== null &&
		!Array.isArray(obj) &&
		typeof obj === "object" &&
		"type" in obj
	) {
		return true;
	}
	return false;
}
export function isConstraintInfo(obj: unknown): obj is ConstraintInfo {
	if (isTypedObject(obj) && obj.type === "constraint" && "variable" in obj) {
		return true;
	}
	return false;
}
export function isPredicateInfo(obj: unknown): obj is PredicateInfo {
	if (
		isTypedObject(obj) &&
		obj.type === "predicate" &&
		"table" in obj &&
		"column" in obj &&
		"operator" in obj &&
		"value" in obj
	) {
		return true;
	}
	return false;
}
export function isOrConstraint(obj: unknown): obj is OrConstraintInfo {
	return (
		isTypedObject(obj) &&
		obj.type === "or_constraint" &&
		"clauses" in obj &&
		Array.isArray(obj.clauses)
	);
}
