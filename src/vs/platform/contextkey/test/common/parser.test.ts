/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Parser } from 'vs/platform/contextkey/common/parser';
import { Scanner, Token } from 'vs/platform/contextkey/common/scanner';
import * as popularWhenClauses from 'vs/platform/contextkey/test/common/popularWhenClauses';

// TODO: come up with more tests that cover more cases

export function parse(input: string): string {
	const parser = new Parser();

	const prints: string[] = [];

	const log = (...ss: string[]) => { ss.forEach(s => prints.push(s)); };

	const ast = parser.parse(input);
	if (ast === undefined) {
		if (parser.lexingErrors.length > 0) {
			log('Lexing errors:', '\n\n');
			parser.lexingErrors.forEach(token => log(Scanner.reportError(token), '\n'));
			log('\n --- \n');
		}

		if (parser.parsingErrors.length > 0) {
			log('Parsing errors:', '\n\n');
			parser.parsingErrors.forEach(({ token, message }: { token: Token; message: string }) => log(`${message}`, '\n'));
		}

	} else {
		log('serialized AST: ', ast.serialize(), '\n\n---\n\n');
		log('JSON AST: ', JSON.stringify(ast, null, '\t'));
	}

	return prints.join('');
}

suite('Context Key Scanner', () => {



	test(' ', () => {
		const input = `!true && foo`;
		assert.deepEqual(parse(input), `foo`);
	});

	test('', () => {
		const input = ` viewItem == VSCode WorkSpace`;
		assert.deepEqual(parse(input), `foo`);
	});


	test('s oo', () => {
		const input = `!isAppcanProject && !inDebugMode && 1===2`;
		assert.deepEqual(parse(input), `foo`);
	});

	test(' oo', () => {
		const input = `foo && 'bar`;
		assert.deepEqual(parse(input), `foo`);
	});

	test(' foo', () => {
		const input = ' foo';
		assert.deepEqual(parse(input), `foo`);
	});

	test('!foo', () => {
		const input = '!foo';
		assert.deepEqual(parse(input),
			`!foo`);
	});

	test('!(foo && bar)', () => {
		const input = '!(foo && bar)';
		assert.deepEqual(parse(input), `!(bar && foo)`);
	});

	test('foo =~ /bar/', () => {
		const input = 'foo =~ /bar/';
		assert.deepEqual(parse(input), `foo =~ /bar/`);
	});

	test('foo =~ /bar/ && isMac', () => {
		const input = 'foo =~ /bar/ && isMac';
		assert.deepEqual(parse(input), `foo =~ /bar/`);
	});

	test('foo || (foo =~ /bar/ && baz)', () => {
		const input = 'foo || (foo =~ /bar/ && isMac)';
		assert.deepEqual(parse(input), `(foo || foo =~ /bar/)`); // FIXME
	});

	test('foo || (foo =~ /bar/ || baz)', () => {
		const input = 'foo || (foo =~ /bar/ || baz)';
		assert.deepEqual(parse(input), `(baz || foo || foo =~ /bar/)`);
	});

	test('foo && (foo =~ /bar/ || isMac)', () => {
		const input = 'foo && (foo =~ /bar/ || isMac)';
		assert.deepEqual(parse(input), `foo`);
	});

	test('foo && foo =~ /zee/i', () => {
		const input = 'foo && foo =~ /zee/i';
		assert.deepEqual(parse(input), `(foo && foo =~ /zee/i)`);
	});

	test('foo.bar==enabled', () => {
		const input = 'foo.bar==enabled';
		assert.deepEqual(parse(input), `foo.bar == 'enabled'`);
	});

	test(`foo.bar == 'enabled'`, () => {
		const input = `foo.bar == 'enabled'`;
		assert.deepEqual(parse(input), `foo.bar == 'enabled'`);
	});

	test('foo.bar:zed==completed - equality with no space', () => {
		const input = 'foo.bar:zed==completed';
		assert.deepEqual(parse(input), `foo.bar:zed == 'completed'`);
	});

	test('a && b || c', () => {
		const input = 'a && b || c';
		assert.deepEqual(parse(input), '(c || (a && b))'); // FIXME: is only the serialization order wrong or evaluation as well?
	});

	test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
		const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
		assert.deepEqual(parse(input), `(baz.jar && fee.bee<K-loo+1> && fooBar)`);
	});

	test('foo.barBaz<C-r> < 2', () => {
		const input = 'foo.barBaz<C-r> < 2';
		assert.deepEqual(parse(input), `foo.barBaz<C-r> < 2`);
	});

	test('foo.bar >= -1', () => {
		const input = 'foo.bar >= -1';
		assert.deepEqual(parse(input), `serialized AST: foo.bar >= -1

	---

	JSON AST: "foo.bar >= -1"`);
	});

	test('   ', () => {
		const input = 'view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded';
		assert.deepEqual(parse(input), `serialized AST: (vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders ')

---

JSON AST: {
	"expr": [
		{
			"key": "vsc-packages-folders-loaded",
			"negated": null,
			"type": 2
		},
		{
			"key": "view",
			"value": "vsc-packages-activitybar-folders ",
			"negated": null,
			"type": 4
		}
	],
	"negated": null,
	"type": 6
}`);
	});

	test('foo.bar <= -1', () => {
		const input = 'foo.bar <= -1';
		assert.deepEqual(parse(input), `foo.bar <= -1`);
	});

	test('debugState == \"stopped\"', () => {
		const input = 'debugState == \"stopped\"';
		assert.deepEqual(parse(input), `debugState == '"stopped"'`); // FIXME ulugbek
	});

	test('!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet', () => {
		const input = '!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet';
		assert.deepEqual(parse(input), `(cmake:enableFullFeatureSet && !cmake:hideBuildCommand)`);
	});

	// FIXME: this throws because of scanner
	test('vim<c-r>==1 && vim<2<=3', () => {
		const input = 'vim<c-r>==1 && vim<2<=3';
		assert.deepEqual(parse(input), `(vim<2< && vim<c-r> == '1')`); // FIXME
	});


	/*
		SYNTAX ERROR HANDLING
	*/
	test('!foo &&  in bar', () => {
		const input = '!foo &&  in bar'; // FIXME !!!
		assert.deepEqual(parse(input), `Parsing errors:

Expected 'true', 'false', '(', KEY, KEY '=~' regex, KEY [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value ] but got {"type":"in","offset":9}
`);
	});

	test('s', () => {
		const input = `view =~ '/(servers)/' && viewItem =~ /^(Starting|Started|Debugging|Stopping|Stopped|Unknown)/'`;
		assert.deepEqual(parse(input), `Lexing errors:

Unexpected token ''' at offset 93

---
`);
	});

	/*
		TESTING EXISTING WHEN CLAUSES
	*/
	test('popular ones', () => {

		let s = ``;

		popularWhenClauses.inputs.forEach((input) => {

			s += `// ${input}`;

			console.log(input);

			let parsed: string | undefined;
			try {
				parsed = parse(input);
			} catch (e) {
				parsed = `ERROR: ${JSON.stringify(e)} for input: ${input}`;
			}

			console.log(parsed);
			console.log(`\n-------\n\n`);

			s += `\`${input}\`, \`${parsed}\``;
		});

		// "when":"resourceScheme == 'vscode-interactive' && notebookKernel =~ /^ms-toolsai.jupyter\\// || resourceScheme == 'vscode-interactive' && !notebookKernel"
		// `view == sass-snippets && viewItem!= snippet`;
		// `view == cassandraWorkbenchView && viewItem != cluster && viewItem != cluster-error && viewItem!=types  && viewItem!=aggregates  && viewItem!=functions  && viewItem!=materialized-views && viewItem!=primarykey && viewItem!=columns  && viewItem!=indexes`;

		assert.equal(s, ``);

	});

});
