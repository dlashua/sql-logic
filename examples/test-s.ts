import { SqlLogic } from "../src/sql-logic.js";
import type { ColumnValue, Var } from "../src/types.js";

const engine = new SqlLogic({
	db: {
		client: "sqlite3",
		connection: { filename: "./data/test.db" },
		useNullAsDefault: true,
	},
	logSql: true,
});

const parent_kid = engine.table("parent_kid");
const people = engine.table("people");

async function test_01() {
	const GP = engine.var("grandparent");
	const P = engine.var("parent");
	const K = engine.var("kid");

	console.log("01. grandparents who like blue");
	console.dir(
		await engine
			.runToArray(
				engine.query([
					parent_kid({ parent: GP, kid: P }),
					parent_kid({ parent: P, kid: K }),
					people({ name: GP, favorite_color: "blue" }),
				]),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 01.\n");
}
await test_01();

async function test_02() {
	const PERSON = engine.var("person");
	const NUMBER = engine.var("number");

	console.log("02. people who have a favorite number greater than 1");
	console.dir(
		await engine
			.runToArray(
				engine.query([
					people({ name: PERSON, favorite_number: NUMBER }),
					engine.gt(NUMBER, 1),
				]),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 02.\n");
}
await test_02();

async function test_03() {
	const PERSON = engine.var("person");
	const COLOR = engine.var("color");

	console.log("03. people who like orange or green (IN)");
	console.dir(
		await engine
			.runToArray(
				engine.query([
					people({ name: PERSON, favorite_color: COLOR }),
					engine.in(COLOR, ["green", "orange"]),
				]),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 03.\n");
}
await test_03();

async function test_04() {
	const PERSON = engine.var("person");
	const COLOR = engine.var("color");

	console.log("04. people who like orange or green (OR)");
	console.dir(
		await engine
			.runToArray(
				engine.query([
					people({ name: PERSON, favorite_color: COLOR }),
					engine.orConstraint([
						engine.eq(COLOR, "green"),
						engine.eq(COLOR, "orange"),
					]),
				]),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 04.\n");
}
await test_04();

async function test_05() {
	const PERSON = engine.var("person");
	const COLOR = engine.var("color");
	const PARENT = engine.var("parent");
	const KID = engine.var("kid");

	console.log("05. two tables with no relation");
	console.dir(
		await engine
			.runToArray(
				engine.query([
					parent_kid({ parent: PARENT, kid: KID }),
					people({ name: PERSON, favorite_color: COLOR }),
				]),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 05.\n");
}
await test_05();

const grandparent_kid = (input: {
	grandparent: ColumnValue | Var;
	grandchild: ColumnValue | Var;
}) => {
	const PARENT = engine.var("grandparent_kid_parent");
	return engine.conj(
		parent_kid({ parent: input.grandparent, kid: PARENT }),
		parent_kid({ parent: PARENT, kid: input.grandchild }),
	);
};

async function test_06() {
	const GP = engine.var("grandparent");
	const K = engine.var("grandchild");
	const NUMBER = engine.var("number");

	console.log("06. grandparents with prewritten relation");
	console.dir(
		await engine
			.runToArray(
				engine.query(
					grandparent_kid({ grandparent: GP, grandchild: K }),
					people({ name: GP, favorite_number: NUMBER }),
				),
			)
			.catch((e) => `ERROR ${e.message}`),
		{ depth: null },
	);
	console.log("end 06.\n");
}
await test_06();

async function test_07() {
	const PERSON = engine.var("person");
	// const COLOR = engine.var("color");

	console.log("07. people who like green or red (DISJ)");
	console.dir(
		await engine.runToArray(
			engine.query(
				engine.disj(
					people({ name: PERSON, favorite_color: "green" }),
					people({ name: PERSON, favorite_color: "red" }),
				),
			),
		),
		{ depth: null },
	);
	console.log("end 07.\n");
}
await test_07();

async function test_08() {
	const PERSON = engine.var("person");
	const COLOR = engine.var("color");

	console.log("08. people who like green or red (OR)");
	console.dir(
		await engine.runToArray(
			engine.query(
				people({ name: PERSON, favorite_color: COLOR }),
				engine.orConstraint([
					engine.eq(COLOR, "green"),
					engine.eq(COLOR, "red"),
				]),
			),
		),
		{ depth: null },
	);
	console.log("end 08.\n");
}
await test_08();
