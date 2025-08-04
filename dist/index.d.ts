import * as knex from 'knex';

interface SqlLogicOptions {
    db: knex.Knex.Config;
    logSql?: boolean;
}
interface OrConstraintInfo {
    type: "or_constraint";
    clauses: ConstraintInfo[];
}
type ColumnValue = string | number | boolean | null;
interface ColumnInfo {
    column: string;
    operator: string;
    value: ColumnValue | Var | ColumnValue[];
}
interface PredicateInfo {
    type: "predicate";
    table: string;
    alias?: string;
    columns: ColumnInfo[];
}
interface UnionInfo {
    type: "union";
    queries: GoalInfo[];
}
interface ConstraintInfo {
    type: "constraint";
    variable: Var;
    operator: string;
    value: ColumnValue | ColumnValue[];
}
type GoalInfo = PredicateInfo | ConstraintInfo | OrConstraintInfo | UnionInfo;
interface Var {
    type: "var";
    id: string;
    name: string;
}

declare function isVar(v: unknown): v is Var;
declare function getVarId(v: unknown): string | null;
declare class SqlLogic {
    #private;
    constructor(options: SqlLogicOptions);
    table(name: string): (obj: Record<string, ColumnValue | Var>) => PredicateInfo;
    query(...goals: Array<GoalInfo | GoalInfo[]>): GoalInfo[];
    var(name?: string): Var;
    runToArray(goals: GoalInfo[]): Promise<any[]>;
    conj(...goals: Array<GoalInfo | GoalInfo[]>): GoalInfo[];
    disj(...goals: GoalInfo[]): UnionInfo;
    orConstraint(clauses: ConstraintInfo[]): {
        type: "or_constraint";
        clauses: ConstraintInfo[];
    };
    gt(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    gte(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    lt(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    lte(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    neq(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    eq(variable: Var, value: ColumnValue): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue;
    };
    in(variable: Var, value: ColumnValue[]): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue[];
    };
    notIn(variable: Var, value: ColumnValue[]): {
        type: "constraint";
        variable: Var;
        operator: string;
        value: ColumnValue[];
    };
}
declare function isTypedObject(obj: unknown): obj is {
    type: string;
};
declare function isConstraintInfo(obj: unknown): obj is ConstraintInfo;
declare function isPredicateInfo(obj: unknown): obj is PredicateInfo;
declare function isOrConstraint(obj: unknown): obj is OrConstraintInfo;

export { SqlLogic, getVarId, isConstraintInfo, isOrConstraint, isPredicateInfo, isTypedObject, isVar };
