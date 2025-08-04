// src/sql-logic.ts
import knex from "knex";
import { nanoid } from "nanoid";

// src/pipe.ts
function pipe(value, ...fns) {
  return fns.reduce((acc, fn) => fn(acc), value);
}
var filterByType = (items, type) => items.filter((item) => item.type === type);
var groupBy = (items, keyFn) => items.reduce(
  (acc, item) => {
    const key = keyFn(item);
    return { ...acc, [key]: [...acc[key] || [], item] };
  },
  {}
);
var hasIntersection = (set1, set2) => Array.from(set1).some((item) => set2.has(item));
var someWithIndex = (items, predicate) => items.some(predicate);

// src/sql-logic-utils.ts
var createWhereClause = (alias, column, operator, value) => (qb) => {
  const columnRef = `${alias}.${column}`;
  const processedValue = (operator === "IN" || operator === "NOT IN") && !Array.isArray(value) ? [value] : value;
  if (operator === "IN") {
    return qb.whereIn(columnRef, processedValue);
  }
  if (operator === "NOT IN") {
    return qb.whereNotIn(columnRef, processedValue);
  }
  return qb.where(columnRef, processedValue);
};
var createOrWhereClause = (alias, column, operator, value) => function() {
  const columnRef = `${alias}.${column}`;
  const processedValue = (operator === "IN" || operator === "NOT IN") && !Array.isArray(value) ? [value] : value;
  if (operator === "IN") {
    this.orWhereIn(columnRef, processedValue);
  } else if (operator === "NOT IN") {
    this.orWhereNotIn(columnRef, processedValue);
  } else {
    this.orWhere(columnRef, processedValue);
  }
};
var applyQueryModifiers = (qb, modifiers) => modifiers.reduce((acc, modifier) => modifier(acc), qb);
function applySelects(selectColumns) {
  return (qb) => selectColumns.length > 0 ? qb.select(
    selectColumns.map((s) => `${s.alias}.${s.column} as ${s.varName}`)
  ) : qb;
}
function applyJoins(varLocations) {
  return (qb) => {
    return pipe(
      Object.values(varLocations),
      (locations) => locations.filter((locs) => locs.length > 1),
      (locations) => locations.flatMap(
        (locs) => locs.flatMap(
          (t1, i) => locs.slice(i + 1).map((t2) => ({
            t1,
            t2,
            pairKey: [t1.alias, t2.alias].sort().join("::")
          }))
        )
      ),
      (pairs) => pairs.reduce(
        (acc, { t1, t2, pairKey }) => {
          if (!acc.seen.has(pairKey)) {
            acc.pairs.push([t1, t2]);
            acc.seen.add(pairKey);
          }
          return acc;
        },
        {
          pairs: [],
          seen: /* @__PURE__ */ new Set()
        }
      ),
      (result) => result.pairs,
      (pairs) => pairs.reduce(
        (builder, [t1, t2]) => builder.join({ [t2.alias]: t2.table }, function() {
          this.on(
            `${t1.alias}.${t1.column}`,
            "=",
            `${t2.alias}.${t2.column}`
          );
        }),
        qb
      )
    );
  };
}
function applyPredicateWheres(predicates) {
  return (qb) => {
    const modifiers = predicates.filter((pred) => pred.alias).flatMap(
      (pred) => pred.columns.filter(
        (col) => !isVar(col.value)
      ).map(
        (col) => createWhereClause(pred.alias, col.column, col.operator, col.value)
      )
    );
    return applyQueryModifiers(qb, modifiers);
  };
}
function applyOrConstraint(qb, or, varLocations) {
  const orClauses = or.clauses.flatMap((clause) => {
    const varId = getVarId(clause.variable);
    const locs = varId ? varLocations[varId] || [] : [];
    return locs.map(
      (loc) => createOrWhereClause(loc.alias, loc.column, clause.operator, clause.value)
    );
  });
  return qb.where(function() {
    orClauses.forEach((orClause) => orClause.call(this));
  });
}
function applyAllOrConstraints(orConstraints, varLocations) {
  return (qb) => orConstraints.reduce(
    (acc, or) => acc.modify((q) => applyOrConstraint(q, or, varLocations)),
    qb
  );
}
function splitGoals(goals) {
  const flattenGoals = (goals2) => goals2.flatMap(
    (g) => g.type === "union" ? g.queries.flatMap(
      (branch) => flattenGoals(Array.isArray(branch) ? branch : [branch])
    ) : [g]
  );
  const allGoals = flattenGoals(goals);
  return {
    predicates: filterByType(allGoals, "predicate"),
    constraints: filterByType(allGoals, "constraint"),
    orConstraints: filterByType(allGoals, "or_constraint"),
    unions: filterByType(goals, "union")
  };
}
var makePredicateWithAliases = (predicates) => predicates.map((pred, i) => ({
  ...pred,
  alias: `t${i + 1}`
}));
var makeSelectColumns = (varLocations) => Object.values(varLocations).map((locations) => locations[0]).filter((location) => location != null);
var createVarLocation = (pred, col) => {
  const varId = getVarId(col.value);
  return varId && pred.alias ? {
    varId,
    alias: pred.alias,
    table: pred.table,
    column: col.column,
    varName: col.value.name
  } : null;
};
var extractVarLocationsFromPredicate = (pred) => pred.columns.filter((col) => isVar(col.value)).map((col) => createVarLocation(pred, col)).filter((x) => x !== null);
var makeVarLocations = (predicates) => pipe(
  predicates,
  (preds) => preds.flatMap(extractVarLocationsFromPredicate),
  (locations) => groupBy(locations, (loc) => loc.varId)
);
function arePredicatesDisconnected(predicates) {
  const varSets = predicates.map(
    (pred) => new Set(
      pred.columns.filter((c) => isVar(c.value)).map((c) => getVarId(c.value))
    )
  );
  const hasSharedVariable = someWithIndex(
    varSets,
    (set1, i) => varSets.slice(i + 1).some((set2) => hasIntersection(set1, set2))
  );
  return predicates.length > 1 && !hasSharedVariable;
}
var applyCrossJoinsIfDisconnected = (predicates) => (qb) => !arePredicatesDisconnected(predicates) ? qb : predicates.slice(1).reduce(
  (acc, pred) => acc.join(`${pred.table} as ${pred.alias}`, () => {
  }),
  qb
);
function applyUnions(unions, knex2) {
  return (qb) => {
    if (unions.length === 0) return qb;
    const subqueries = unions.flatMap(
      (unionInfo) => unionInfo.queries.map(
        (subGoals) => buildKnexQueryFromGoals(
          knex2,
          Array.isArray(subGoals) ? subGoals : [subGoals]
        )
      )
    );
    if (subqueries.length === 0) return qb;
    return qb.union(subqueries);
  };
}
function handleEmptyPredicates() {
  throw new Error(
    "No goals provided - cannot build query without predicates or unions"
  );
}
var createConstraintPipeline = (getVarId2, createModifier) => (items, varLocations) => (qb) => {
  const modifiers = flatMapLocations(
    items,
    getVarId2,
    varLocations,
    createModifier
  );
  return applyQueryModifiers(qb, modifiers);
};
var flatMapLocations = (items, getVarId2, varLocations, createClause) => items.flatMap((item) => {
  const locs = getVariableLocations(getVarId2(item), varLocations);
  return locs.map((loc) => createClause(loc, item));
});
var getVariableLocations = (varId, varLocations) => varId ? varLocations[varId] || [] : [];
var applyWhereConstraints = createConstraintPipeline(
  (constraint) => getVarId(constraint.variable),
  (loc, constraint) => createWhereClause(
    loc.alias,
    loc.column,
    constraint.operator,
    constraint.value
  )
);
function buildKnexQueryFromGoals(knex2, goals) {
  if (goals.length === 1 && goals[0].type === "union") {
    const union = goals[0];
    const subqueries = union.queries.map(
      (subGoals) => buildKnexQueryFromGoals(
        knex2,
        Array.isArray(subGoals) ? subGoals : [subGoals]
      )
    );
    return knex2.union(subqueries);
  }
  const { predicates, constraints, orConstraints, unions } = splitGoals(goals);
  const predicatesWithAliases = makePredicateWithAliases(predicates);
  if (predicatesWithAliases.length === 0) {
    handleEmptyPredicates();
  }
  const varLocations = makeVarLocations(predicatesWithAliases);
  const selectColumns = makeSelectColumns(varLocations);
  const baseQuery = knex2({
    [predicatesWithAliases[0].alias]: predicatesWithAliases[0].table
  });
  return pipe(
    baseQuery,
    applyCrossJoinsIfDisconnected(predicatesWithAliases),
    applySelects(selectColumns),
    applyJoins(varLocations),
    applyWhereConstraints(constraints, varLocations),
    applyPredicateWheres(predicatesWithAliases),
    applyAllOrConstraints(orConstraints, varLocations),
    applyUnions(unions, knex2)
  );
}

// src/sql-logic.ts
function isVar(v) {
  if (v && typeof v === "object" && v !== null && "type" in v && v.type === "var") {
    return true;
  }
  return false;
}
function getVarId(v) {
  if (isVar(v)) {
    return v.id;
  }
  return null;
}
var SqlLogic = class {
  #db;
  #logSql = true;
  #vars = /* @__PURE__ */ new Map();
  constructor(options) {
    this.#db = knex(options.db);
    this.#logSql = options.logSql ?? false;
  }
  table(name) {
    return function query(obj) {
      return {
        type: "predicate",
        table: name,
        columns: Object.entries(obj).map(([column, value]) => ({
          column,
          operator: "=",
          value
        }))
      };
    };
  }
  query(...goals) {
    return this.conj(...goals);
  }
  var(name) {
    const id = nanoid();
    name ??= id;
    const thisVar = {
      type: "var",
      id,
      name
    };
    this.#vars.set(id, thisVar);
    return thisVar;
  }
  async runToArray(goals) {
    const kQuery = buildKnexQueryFromGoals(this.#db, goals);
    if (this.#logSql) {
      console.log(`[SQL] ${kQuery.toString()}`);
    }
    return await kQuery;
  }
  conj(...goals) {
    return goals.flatMap((g) => Array.isArray(g) ? g : [g]);
  }
  disj(...goals) {
    return {
      type: "union",
      queries: goals
    };
  }
  // CONSTRAINTS
  orConstraint(clauses) {
    return {
      type: "or_constraint",
      clauses
    };
  }
  gt(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: ">",
      value
    };
  }
  gte(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: ">=",
      value
    };
  }
  lt(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "<",
      value
    };
  }
  lte(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "<=",
      value
    };
  }
  neq(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "!=",
      value
    };
  }
  eq(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "=",
      value
    };
  }
  in(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "IN",
      value
    };
  }
  notIn(variable, value) {
    return {
      type: "constraint",
      variable,
      operator: "NOT IN",
      value
    };
  }
};
function isTypedObject(obj) {
  if (obj && obj !== null && !Array.isArray(obj) && typeof obj === "object" && "type" in obj) {
    return true;
  }
  return false;
}
function isConstraintInfo(obj) {
  if (isTypedObject(obj) && obj.type === "constraint" && "variable" in obj) {
    return true;
  }
  return false;
}
function isPredicateInfo(obj) {
  if (isTypedObject(obj) && obj.type === "predicate" && "table" in obj && "column" in obj && "operator" in obj && "value" in obj) {
    return true;
  }
  return false;
}
function isOrConstraint(obj) {
  return isTypedObject(obj) && obj.type === "or_constraint" && "clauses" in obj && Array.isArray(obj.clauses);
}
export {
  SqlLogic,
  getVarId,
  isConstraintInfo,
  isOrConstraint,
  isPredicateInfo,
  isTypedObject,
  isVar
};
//# sourceMappingURL=index.js.map