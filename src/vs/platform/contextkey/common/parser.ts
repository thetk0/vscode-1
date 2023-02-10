/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalState } from 'vs/base/common/errors';
import { ContextKeyExpr, ContextKeyExpression, ContextKeyGreaterEqualsExpr, ContextKeyGreaterExpr, ContextKeySmallerEqualsExpr, ContextKeySmallerExpr } from 'vs/platform/contextkey/common/contextkey';
import { Scanner, Token, TokenType } from './scanner';

/*

Syntax grammar:

```ebnf

expression ::= or

or ::= and { '||' and }*

and ::= term { '&&' term }*

term ::=
	| '!' term    	// so, we could have this as `'!' primary`, but I think it's important to allow smth like !(a && b || c)
	| primary

primary ::=
	| 'true'
	| 'false'
	| '(' expression ')'
	| KEY '=~' REGEX
	| KEY [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'not' 'in' | 'in') value ]

value ::=
	| 'true'
	| 'false'
	| 'in'      	// we support `in` as a value because there's an extension that uses it, ie "when": "languageId = in"
	| KEY
	| SINGLE_QUOTED_STR
	| EMPTY_STR  	// this allows "when": "foo == " which's used by existing extensions

```
*/

class ParseError extends Error { }

// Note: this doesn't produce an exact syntax tree but an optimized (aka normalized) one
// ContextKeyExpression's that we use as AST nodes do not expose constructors that do not optimize
export class Parser {

	// TODO@ulugbekna: rewrite to fit lazy nature of the scanner ?

	private _tokens: Token[] = [];
	private _current = 0;
	private _parsingErrors: { token: Token; message: string }[] = []; // FIXME:
	private _scanner = new Scanner();

	get lexingErrors(): Readonly<Token[]> {
		return this._scanner.errorTokens;
	}

	// TODO: this could use a prettier return
	get parsingErrors(): Readonly<{ token: Token; message: string }[]> {
		return this._parsingErrors;
	}

	/**
	 * Parse a context key expression.
	 *
	 * @param input the expression to parse
	 * @returns the parsed expression or `undefined` if the input is empty
	 */
	parse(input: string): ContextKeyExpression | undefined {

		if (input === '') {
			return undefined;
		}

		this._scanner.reset(input);

		this._tokens = [...this._scanner];

		if (this._scanner.errorTokens.length > 0) {
			return undefined;
		}

		this._current = 0;
		this._parsingErrors = [];

		try {
			const expr = this._expr();
			if (!this._isAtEnd()) {
				this._parsingErrors.push({ token: this._peek(), message: `Unexpected token: ${this._peek()}` });
				throw new ParseError();
			}
			return expr;
		} catch (e) {
			if (!(e instanceof ParseError)) {
				this._parsingErrors.push({ token: this._peek(), message: e.message });
			}
			return undefined;
		}
	}

	private _expr(): ContextKeyExpression {
		return this._or();
	}

	private _or(): ContextKeyExpression {
		const expr = [this._and()];

		while (this._match(TokenType.Or)) {
			const right = this._and();
			expr.push(right);
		}

		return expr.length === 1 ? expr[0] : ContextKeyExpr.or(...expr)!; // FIXME: bang
	}

	private _and(): ContextKeyExpression {
		const expr = [this._term()];

		while (this._match(TokenType.And)) {
			const right = this._term();
			expr.push(right);
		}

		return expr.length === 1 ? expr[0] : ContextKeyExpr.and(...expr)!; // FIXME: bang
	}

	/*
	term ::=
		| '!' term    	// so, we could have this as `'!' primary`, but I think it's important to allow smth like !(a && b || c)
		| primary
	*/
	private _term(): ContextKeyExpression {
		if (this._match(TokenType.Neg)) {
			const expr = this._term();
			return ContextKeyExpr.not(expr);
		} else {
			return this._primary();
		}
	}

	/*
	primary ::=
		| 'true'
		| 'false'
		| '(' expression ')'
		| KEY '=~' REGEX
		| KEY [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'not' 'in' | 'in') value ]
	*/
	private _primary(): ContextKeyExpression {

		if (this._match(TokenType.True)) {
			return ContextKeyExpr.true();

		} else if (this._match(TokenType.False)) {
			return ContextKeyExpr.false();

		} else if (this._match(TokenType.LParen)) {
			const expr = this._expr();
			this._consume(TokenType.RParen, `Expected ')'`); // I think only possible if we ate all tokens, ie at the end; so we could, though undesirable IMHO, 'put' the RParen ourselves
			return expr;

		} else if (this._match(TokenType.Str)) {
			// KEY
			const key = this._previous().lexeme!;

			// =~ regex
			if (this._match(TokenType.RegexOp)) {

				if (this._match(TokenType.RegexStr, TokenType.RegexStrI)) { // expected tokens
					const regex = this._previous();
					const optionalI = regex.type === TokenType.RegexStrI ? 'i' : '';
					return ContextKeyExpr.regex(key, new RegExp(regex.lexeme!, optionalI));

				} if (this._match(TokenType.QuotedStr)) { // TODO: this copies old parser's behavior; should be changed; `strict` is hard-coded to `false` - is this correct?
					const strict = false;

					let regex;

					const serializedValue = this._previous().lexeme!;
					const start = serializedValue.indexOf('/');
					const end = serializedValue.lastIndexOf('/');
					if (start === end || start < 0 /* || to < 0 */) {
						if (strict) {
							throw new Error(`bad regexp-value '${serializedValue}', missing /-enclosure`);
						} else {
							console.warn(`bad regexp-value '${serializedValue}', missing /-enclosure`);
						}
						regex = /invalid/;
					}

					const value = serializedValue.slice(start + 1, end);
					const caseIgnoreFlag = serializedValue[end + 1] === 'i' ? 'i' : '';
					try {
						regex = new RegExp(value, caseIgnoreFlag);
					} catch (e) {
						if (strict) {
							throw new Error(`bad regexp-value '${serializedValue}', parse error: ${e}`);
						} else {
							console.warn(`bad regexp-value '${serializedValue}', parse error: ${e}`);
						}
						regex = /invalid/;
					}

					return ContextKeyExpr.regex(key, regex);
				} else {
					throw this._error(this._peek(), `Expected regex string but got ${JSON.stringify(this._peek())}`);
				}
			}

			// [ 'not' 'in' value ]
			if (this._match(TokenType.Not)) {
				this._consume(TokenType.In, 'Expected "in" after "not"');
				const right = this._value();
				return ContextKeyExpr.notIn(key, right);
			}

			// [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in') value ]
			if (this._match(TokenType.Eq, TokenType.NotEq, TokenType.Lt, TokenType.LtEq, TokenType.Gt, TokenType.GtEq, TokenType.In)) {
				const op = this._previous().type;
				const right = this._value();
				switch (op) {
					case TokenType.Eq: {
						switch (right) {
							case 'true':
								return ContextKeyExpr.has(key);
							case 'false':
								return ContextKeyExpr.not(ContextKeyExpr.has(key));
							default:
								return ContextKeyExpr.equals(key, right);
						}
					}
					case TokenType.NotEq: {
						switch (right) {
							case 'true':
								return ContextKeyExpr.not(ContextKeyExpr.has(key));
							case 'false':
								return ContextKeyExpr.has(key);
							default:
								return ContextKeyExpr.notEquals(key, right);
						}
					}

					// TODO: ContextKeyExpr.smaller(key, right) accepts only `number` as `right` AND during eval of this node, we just eval to `false` if `right` is not a number
					// consequently, package.json linter should warn the user if they're passing undesired things to ops
					case TokenType.Lt: return ContextKeySmallerExpr.create(key, right);
					case TokenType.LtEq: return ContextKeySmallerEqualsExpr.create(key, right);
					case TokenType.Gt: return ContextKeyGreaterExpr.create(key, right);
					case TokenType.GtEq: return ContextKeyGreaterEqualsExpr.create(key, right);

					case TokenType.In: return ContextKeyExpr.in(key, right);

					default:
						throw illegalState(`must've matched the op with this._match() call above`);
				}
			}

			return ContextKeyExpr.has(key);
		} else {
			throw this._error(this._peek(), `Expected 'true', 'false', '(', KEY, KEY '=~' regex, KEY [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value ] but got ${JSON.stringify(this._peek())}`);
		}
	}

	private _value(): string { // TODO@ulugbekna: cleanup & optimize
		if (this._match(TokenType.Str, TokenType.QuotedStr)) {
			return this._previous().lexeme!;
		} if (this._match(TokenType.True)) {
			return 'true';
		} if (this._match(TokenType.False)) {
			return 'false';
		} if (this._match(TokenType.In)) { // we support `in` as a value, e.g., "when": "languageId == in"
			return 'in';
		} else {
			return ''; // this allows "when": "foo == " which's used by existing extensions
		}
	}

	// careful: this can throw if current token is the initial one (ie index = 0)
	private _previous() {
		return this._tokens[this._current - 1];
	}

	private _match(...tokens: TokenType[]) {
		for (const token of tokens) {
			if (this._check(token)) {
				this._advance();
				return true;
			}
		}

		return false;
	}

	private _advance() {
		if (!this._isAtEnd()) {
			this._current++;
		}
		return this._previous();
	}

	private _consume(type: TokenType, message: string) {
		if (this._check(type)) {
			return this._advance();
		}

		throw this._error(this._peek(), message);
	}

	private _error(token: Token, message: string) {
		this._parsingErrors.push({ token, message });
		return new ParseError();
	}

	private _check(type: TokenType) {
		return !this._isAtEnd() && this._peek().type === type;
	}

	private _peek() {
		return this._tokens[this._current];
	}

	private _isAtEnd() {
		return this._peek().type === TokenType.EOF;
	}
}
