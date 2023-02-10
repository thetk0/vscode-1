/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Scanner, TokenType } from 'vs/platform/contextkey/common/scanner';

suite('Context Key Scanner', () => {
	function assertTokenTypes(str: string, ...expected: TokenType[]) {
		const scanner = new Scanner().reset(str);
		const tokens = [...scanner];
		expected.push(TokenType.EOF);
		assert.equal(tokens.length, expected.length, 'len: ' + str);
		tokens.forEach((token, i) => {
			assert.equal(token.type, expected[i], token.lexeme ? token.lexeme : token.type);
		});
	}

	function scanToJSON(str: string): string {
		const scanner = new Scanner().reset(str);
		const tokens = [...scanner];
		return JSON.stringify(tokens, null, '\t');
	}

	test('single', () => {
		assertTokenTypes('(', TokenType.LParen);
		assertTokenTypes(')', TokenType.RParen);

		assertTokenTypes('!', TokenType.Neg);

		assertTokenTypes('==', TokenType.Eq);
		assertTokenTypes('===', TokenType.Eq);
		assertTokenTypes('!=', TokenType.NotEq);
		assertTokenTypes('!==', TokenType.NotEq);

		assertTokenTypes('<', TokenType.Lt);
		assertTokenTypes('<=', TokenType.LtEq);
		assertTokenTypes('>', TokenType.Gt);
		assertTokenTypes('>=', TokenType.GtEq);

		assertTokenTypes('=~', TokenType.RegexOp);

		assertTokenTypes('=~', TokenType.RegexOp);

		assertTokenTypes('/foo/', TokenType.RegexStr);
		assertTokenTypes('/foo/i', TokenType.RegexStrI);

		assertTokenTypes('true', TokenType.True);
		assertTokenTypes('false', TokenType.False);

		assertTokenTypes('in', TokenType.In);
		assertTokenTypes('not', TokenType.Not);
		assertTokenTypes('not in', TokenType.Not, TokenType.In);

		assertTokenTypes('&&', TokenType.And);
		assertTokenTypes('||', TokenType.Or);

		assertTokenTypes('a', TokenType.Str);
		assertTokenTypes('a.b', TokenType.Str);
		assertTokenTypes('.b.c', TokenType.Str);
		assertTokenTypes('Foo<C-r>', TokenType.Str);
		assertTokenTypes('foo.bar<C-shift+2>', TokenType.Str);
		assertTokenTypes('foo.bar:zee', TokenType.Str);

		assertTokenTypes('\'hello world\'', TokenType.QuotedStr);

		assertTokenTypes(' ');
		assertTokenTypes('\n');
		assertTokenTypes('  ');
		assertTokenTypes(' \n ');
	});

	test('foo.bar<C-shift+2>', () => {
		const input = 'foo.bar<C-shift+2>';
		assert.deepEqual(scanToJSON(input), ' ');
	});

	test('!foo', () => {
		const input = '!foo';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "!",
		"offset": 0
	},
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 1
	},
	{
		"type": "EOF",
		"offset": 4
	}
]`);
	});

	test('!(foo && bar)', () => {
		const input = '!(foo && bar)';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "!",
		"offset": 0
	},
	{
		"type": "(",
		"offset": 1
	},
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 2
	},
	{
		"type": "&&",
		"offset": 6
	},
	{
		"type": "Str",
		"lexeme": "bar",
		"offset": 9
	},
	{
		"type": ")",
		"offset": 12
	},
	{
		"type": "EOF",
		"offset": 13
	}
]`);
	});

	test('foo =~ /bar/', () => {
		const input = 'foo =~ /bar/';
		assert.deepEqual(scanToJSON(input), `[
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 0
	},
	{
		"type": "=~",
		"offset": 4
	},
	{
		"type": "RegexStr",
		"lexeme": "bar",
		"offset": 8
	},
	{
		"type": "EOF",
		"offset": 12
	}
]`);
	});

	test('foo =~ /aslkdfu3 50 90231 ^&!===1/', () => {
		const input = 'foo =~ /aslkdfu3 50 90231 ^&!===1/';
		assert.deepEqual(scanToJSON(input), `[
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 0
	},
	{
		"type": "=~",
		"offset": 4
	},
	{
		"type": "RegexStr",
		"lexeme": "aslkdfu3 50 90231 ^&!===1",
		"offset": 8
	},
	{
		"type": "EOF",
		"offset": 34
	}
]`);
	});

	test('foo =~ /zee/i', () => {
		const input = 'foo =~ /zee/i';
		assert.deepEqual(scanToJSON(input), `[
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 0
	},
	{
		"type": "=~",
		"offset": 4
	},
	{
		"type": "RegexStrI",
		"lexeme": "zee",
		"offset": 8
	},
	{
		"type": "EOF",
		"offset": 13
	}
]`);
	});

	test('!(foo && bar) && baz', () => {
		const input = '!(foo && bar) && baz';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "!",
		"offset": 0
	},
	{
		"type": "(",
		"offset": 1
	},
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 2
	},
	{
		"type": "&&",
		"offset": 6
	},
	{
		"type": "Str",
		"lexeme": "bar",
		"offset": 9
	},
	{
		"type": ")",
		"offset": 12
	},
	{
		"type": "&&",
		"offset": 14
	},
	{
		"type": "Str",
		"lexeme": "baz",
		"offset": 17
	},
	{
		"type": "EOF",
		"offset": 20
	}
]`);
	});

	test(`===`, () => {
		const input = `foo === bar`;
		const scanner = new Scanner().reset(input);
		const r = [...scanner].filter(t => t.type === TokenType.Error).map(Scanner.reportError);
		assert.deepEqual(r, [
			"Unexpected token '=' at offset 6. Did you mean '==' or '=~'?"
		]);
	});

	test(`foo === '`, () => {
		const input = `foo === '`;
		const scanner = new Scanner().reset(input);
		const r = [...scanner].filter(t => t.type === TokenType.Error).map(Scanner.reportError);
		assert.deepEqual(r, [
			"Unexpected token ''' at offset 8"
		]);
	});

	test(`foo === bar'`, () => {
		const input = `foo === bar'`;
		const scanner = new Scanner().reset(input);
		const r = [...scanner].filter(t => t.type === TokenType.Error).map(Scanner.reportError);
		assert.deepEqual(r, [
			"Unexpected token ''' at offset 11"
		]);
	});

	test(`foo && 'bar - unterminated single quote`, () => {
		const input = `foo && 'bar`;
		assert.deepEqual(scanToJSON(input), `[
	{
		"type": "Str",
		"lexeme": "foo",
		"offset": 0
	},
	{
		"type": "&&",
		"offset": 4
	},
	{
		"type": "ErrorToken",
		"offset": 7,
		"lexeme": "'bar"
	},
	{
		"type": "EOF",
		"offset": 11
	}
]`);
	});

	test('foo.bar:zed==completed - equality with no space', () => {
		const input = 'foo.bar:zed==completed';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "foo.bar:zed",
		"offset": 0
	},
	{
		"type": "==",
		"offset": 11
	},
	{
		"type": "Str",
		"lexeme": "completed",
		"offset": 13
	},
	{
		"type": "EOF",
		"offset": 22
	}
]`);
	});

	test('a && b || c', () => {
		const input = 'a && b || c';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "a",
		"offset": 0
	},
	{
		"type": "&&",
		"offset": 2
	},
	{
		"type": "Str",
		"lexeme": "b",
		"offset": 5
	},
	{
		"type": "||",
		"offset": 7
	},
	{
		"type": "Str",
		"lexeme": "c",
		"offset": 10
	},
	{
		"type": "EOF",
		"offset": 11
	}
]`);
	});

	test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
		const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "fooBar",
		"offset": 0
	},
	{
		"type": "&&",
		"offset": 7
	},
	{
		"type": "Str",
		"lexeme": "baz.jar",
		"offset": 10
	},
	{
		"type": "&&",
		"offset": 18
	},
	{
		"type": "Str",
		"lexeme": "fee.bee<K-loo+1>",
		"offset": 21
	},
	{
		"type": "EOF",
		"offset": 37
	}
]`);
	});

	test('foo.barBaz<C-r> < 2', () => {
		const input = 'foo.barBaz<C-r> < 2';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "foo.barBaz<C-r>",
		"offset": 0
	},
	{
		"type": "<",
		"offset": 16
	},
	{
		"type": "Str",
		"lexeme": "2",
		"offset": 18
	},
	{
		"type": "EOF",
		"offset": 19
	}
]`);
	});

	test('foo.bar >= -1', () => {
		const input = 'foo.bar >= -1';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "foo.bar",
		"offset": 0
	},
	{
		"type": ">=",
		"offset": 8
	},
	{
		"type": "Str",
		"lexeme": "-1",
		"offset": 11
	},
	{
		"type": "EOF",
		"offset": 13
	}
]`);
	});

	test('foo.bar <= -1', () => {
		const input = 'foo.bar <= -1';
		assert.deepEqual(scanToJSON(input),
			`[
	{
		"type": "Str",
		"lexeme": "foo.bar",
		"offset": 0
	},
	{
		"type": "<=",
		"offset": 8
	},
	{
		"type": "Str",
		"lexeme": "-1",
		"offset": 11
	},
	{
		"type": "EOF",
		"offset": 13
	}
]`);
	});


	test('FIXME: vim<c-r>==1 && vim<2<=3', () => {
		// FIXME: this throws
		// const input = 'vim<c-r>==1 && vim<2<=3';
	});

	test('34', () => {
		// FIXME: this throws
		const input = "resource =~ /\\/Objects\\/.+\\.xml$/";
		assert.equal(scanToJSON(input), `[`);
	});
	// resource = ~ /\/Objects\/.+\.xml$/
	test('view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded', () => {
		// FIXME: this throws
		const input = `view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`;
		assert.equal(scanToJSON(input), `[
			{
				"type": "Str",
				"lexeme": "view",
				"offset": 0
			},
			{
				"type": "==",
				"offset": 5
			},
			{
				"type": "Str",
				"lexeme": "vsc-packages-activitybar-folders ",
				"offset": 8
			},
			{
				"type": "&&",
				"offset": 41
			},
			{
				"type": "Str",
				"lexeme": "vsc-packages-folders-loaded",
				"offset": 44
			},
			{
				"type": "EOF",
				"offset": 71
			}
		]`);
	});

	test('!isAppcanProject && !inDebugMode && 1===2', () => {
		// FIXME: this throws
		const input = `!isAppcanProject && !inDebugMode && 1===2`;
		const sc = new Scanner().reset(input);
		const _tokens = [...sc];
		assert.ok(sc.errorTokens.length > 0);
		assert.equal(scanToJSON(input), `[`);
	});

	test(`view =~ '/(servers)/' && viewItem =~ '/^(Starting|Started|Debugging|Stopping|Stopped)/'`, () => {
		const input = `view =~ '/(servers)/' && viewItem =~ '/^(Starting|Started|Debugging|Stopping|Stopped)/'`;
		assert.deepEqual(scanToJSON(input), `[
	{
		"type": "Str",
		"lexeme": "view",
		"offset": 0
	},
	{
		"type": "=~",
		"offset": 5
	},
	{
		"type": "QuotedStr",
		"lexeme": "/(servers)/",
		"offset": 9
	},
	{
		"type": "&&",
		"offset": 22
	},
	{
		"type": "Str",
		"lexeme": "viewItem",
		"offset": 25
	},
	{
		"type": "=~",
		"offset": 34
	},
	{
		"type": "QuotedStr",
		"lexeme": "/^(Starting|Started|Debugging|Stopping|Stopped)/",
		"offset": 38
	},
	{
		"type": "EOF",
		"offset": 87
	}
]`);
	});

	// test('scan results 2', () => {
	// 	const input = 'vim.usesOf<C-r> < 2';
	// 	const scanner = new Scanner();
	// 	scanner.reset(input);
	// 	assert.strictEqual(scanWithLexemes(input, [...scanner]), []);
	// });
});
