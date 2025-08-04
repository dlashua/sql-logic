export interface SqlLogicOptions {
	db: import("knex").Knex.Config;
	logSql?: boolean;
}

export interface OrConstraintInfo {
	type: "or_constraint";
	clauses: ConstraintInfo[];
}

export type ColumnValue = string | number | boolean | null;

export interface ColumnInfo {
	column: string;
	operator: string;
	value: ColumnValue | Var | ColumnValue[];
}

export interface PredicateInfo {
	type: "predicate";
	table: string;
	alias?: string;
	columns: ColumnInfo[];
}

export interface UnionInfo {
	type: "union";
	queries: GoalInfo[];
}

export interface ConstraintInfo {
	type: "constraint";
	variable: Var;
	operator: string;
	value: ColumnValue | ColumnValue[];
}

export type GoalInfo =
	| PredicateInfo
	| ConstraintInfo
	| OrConstraintInfo
	| UnionInfo;

export interface Var {
	type: "var";
	id: string;
	name: string;
}

export interface SelectColumn {
	column: string;
	alias: string;
}
export interface WhereClause {
	column: string;
	operator: string;
	value: ColumnValue | ColumnValue[];
}

export interface JoinInfo {
	on: [string, string][];
}

export interface TableEntry {
	whereClauses: WhereClause[];
	selectColumns: SelectColumn[];
	joins: Record<string, JoinInfo>;
}

export interface TablePlan {
	[tableKey: string]: TableEntry;
}
