/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { illegalArgument } from 'vs/base/common/errors';

export enum TokenType {
	LParen = '(',
	RParen = ')',

	Neg = '!',

	Eq = '==',
	NotEq = '!=',

	Lt = '<',
	LtEq = '<=',
	Gt = '>',
	GtEq = '>=',

	RegexOp = '=~',

	RegexStr = 'RegexStr',
	RegexStrI = 'RegexStrI',

	True = 'true',
	False = 'false',

	In = 'in',
	Not = 'not',

	And = '&&',
	Or = '||',

	Str = 'Str',

	// '.*'
	QuotedStr = 'QuotedStr',

	Error = 'ErrorToken',

	EOF = 'EOF'
}

export type Token = {
	type: TokenType;
	offset: number;
	lexeme?: string;
};

/**
 * A simple scanner for context keys.
 *
 * Example:
 *
 * ```ts
 * const scanner = new Scanner().reset('resourceFileName =~ /docker/ && !config.docker.enabled');
 * const tokens = [...scanner];
 * if (scanner.errorTokens.length > 0) {
 *     scanner.errorTokens.forEach(token => console.error(Scanner.reportError(token)));
 * } else {
 *     // process tokens
 * }
 * ```
 */
export class Scanner {

	/**
	 * Provides an error message for the given error token.
	 *
	 * @throws Error if the token is not an error token
	 */
	static reportError(token: Token): string {
		if (token.type !== TokenType.Error) { throw illegalArgument(`expected an error token but got ${JSON.stringify(token)}`); }

		switch (token.lexeme) {
			case '=': return `Unexpected token '${token.lexeme}' at offset ${token.offset}. Did you mean '==' or '=~'?`;
			case '&': return `Unexpected token '${token.lexeme}' at offset ${token.offset}. Did you mean '&&'?`;
			case '|': return `Unexpected token '${token.lexeme}' at offset ${token.offset}. Did you mean '||'?`;
			default: {
				const lexeme = token.lexeme;

				if (lexeme && lexeme.length > 1 && lexeme.startsWith(`'`)) {
					return `Unexpected token '${token.lexeme}' at offset ${token.offset}. Did you forget to close the string?`;
				}

				if (lexeme && lexeme.length > 1 && lexeme.endsWith(`'`)) {
					return `Unexpected token '${token.lexeme}' at offset ${token.offset}. Did you forget to open the string?`;
				}

				return `Unexpected token '${token.lexeme}' at offset ${token.offset}`;
			}
		}
	}

	private static _whitespace = /^\s*/;

	private static _keywords = new Map<string, TokenType>([
		['not', TokenType.Not],
		['in', TokenType.In],
		['false', TokenType.False],
		['true', TokenType.True],
	]);

	private _input: string = '';
	private _start: number = 0;
	private _current: number = 0;
	private _errorTokens: Token[] = [];

	get errorTokens(): Readonly<Token[]> {
		return this._errorTokens;
	}

	reset(value: string) {
		this._input = value;

		this._start = 0;
		this._current = 0;
		this._errorTokens = [];

		return this;
	}

	next(): Token {
		this._eatWhitespace();

		if (this._isAtEnd()) {
			return { type: TokenType.EOF, offset: this._current };
		}

		this._start = this._current;

		const ch = this._advance();
		switch (ch) {
			case '(': return this._token(TokenType.LParen);
			case ')': return this._token(TokenType.RParen);

			case '!': {
				if (this._match('=')) { // support `!=`
					if (this._match('=')) { // support `!==` as the same operator as `!=`
						return this._token(TokenType.NotEq);
					}
					return this._token(TokenType.NotEq);
				}
				return this._token(TokenType.Neg);
			}

			case '\'': return this._quotedString();
			case '/': return this._regex();

			case '=':
				if (this._match('=')) { // support `==`
					if (this._match('=')) { // support `===` as the same operator as `==`
						return this._token(TokenType.Eq);
					}
					return this._token(TokenType.Eq);
				} else if (this._match('~')) {
					return this._token(TokenType.RegexOp);
				} else {
					return this._error();
				}

			case '<': return this._token(this._match('=') ? TokenType.LtEq : TokenType.Lt);

			case '>': return this._token(this._match('=') ? TokenType.GtEq : TokenType.Gt);

			case '&':
				if (this._match('&')) {
					return this._token(TokenType.And);
				} else {
					return this._error();
				}

			case '|':
				if (this._match('|')) {
					return this._token(TokenType.Or);
				} else {
					return this._error();
				}

			// handle whitespace
			case ' ':
			case '\r':
			case '\t':
			case '\n': // TODO@ulugbekna: if we're allowing newlines, we should keep track of line # as well ?
				return this.next();

			default:
				return this._string();
		}
	}

	private _match(expected: string): boolean {
		if (this._isAtEnd()) {
			return false;
		}
		if (this._input[this._current] !== expected) {
			return false;
		}
		this._current++;
		return true;
	}

	private _advance(): string {
		return this._input[this._current++];
	}

	private _peek(): string {
		return this._isAtEnd() ? '\0' : this._input[this._current];
	}

	private _token(type: TokenType, captureLexeme: boolean = false): Token {
		const lexeme = captureLexeme ? this._input.substring(this._start, this._current) : undefined;
		return { type, lexeme, offset: this._start };
	}

	private _error(): Token {
		const errToken = { type: TokenType.Error, offset: this._start, lexeme: this._input.substring(this._start, this._current) };
		this._errorTokens.push(errToken);
		if (!this._isAtEnd()) {
			++this._current;
		}
		return errToken;
	}

	private _string() {
		let peek = this._peek();

		while (this._isStringChar(peek) && !this._isAtEnd()) {
			this._advance();
			peek = this._peek();
		}

		const lexeme = this._input.substring(this._start, this._current);

		const keyword = Scanner._keywords.get(lexeme);

		if (keyword) {
			return this._token(keyword);
		} else {
			return this._token(TokenType.Str, true);
		}
	}

	private _isStringChar(peek: string) {
		if (this._isAlphaNumeric(peek)) { return true; }
		if (this._isWhitespace(peek)) { return false; }

		switch (peek) {
			case ')':
			case '=':
			case '!':
			case '&':
			case '|':
			case '~':
				return false;
			case '_':
			case '-':
			case '.':
			case '/':
			case '\\':
			case ':':
			case '*':
			case '?': // do we have to?
			case '<':
			case '>':
			case '%':
			case '+':
				return true;
			default:
				return false; // FIXME: far too permissive?
		}
	}

	private _isAlphaNumeric(ch: string) {
		return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
	}

	private _isWhitespace(ch: string) {
		return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
	}

	// captures the lexeme without the leading and trailing '
	private _quotedString(): Token {
		while (this._peek() !== `'` && !this._isAtEnd()) { // TODO@ulugbekna: add support for escaping ' ?
			this._advance();
		}

		if (this._isAtEnd()) {
			return this._error();
		}

		// consume the closing '
		this._advance();

		return { type: TokenType.QuotedStr, lexeme: this._input.substring(this._start + 1, this._current - 1), offset: this._start + 1 };
	}

	// /.+/i?
	// the captured lexeme does not include the leading and trailing / (and optional i)
	// FIXME: implement proper regex lexing
	// private _regexOld(): Token {
	// 	while (this._peek() !== '/' && !this._isAtEnd()) {
	// 		this._advance();
	// 	}

	// 	if (this._isAtEnd()) {
	// 		this._error();
	// 	}

	// 	// consume the closing /
	// 	this._advance();

	// 	// consume the optional 'i'
	// 	let type = TokenType.RegexStr;
	// 	if (this._peek() === 'i') {
	// 		this._advance();
	// 		type = TokenType.RegexStrI;
	// 	}

	// 	const start = this._start + 1;
	// 	const end = type === TokenType.RegexStrI ? this._current - 2 : this._current - 1;
	// 	const lexeme = this._input.substring(start, end);

	// 	return { type, lexeme, offset: this._start + 1 };
	// }

	private _regex(): Token {
		let p = this._current;

		let inEscape = false;
		let inCharacterClass = false;
		while (true) {
			// If we reach the end of a file, or hit a newline, then this is an unterminated
			// regex.  Report error and return what we have so far.
			if (p >= this._input.length) {
				return this._error();
			}

			const ch = this._input.charCodeAt(p);

			if (inEscape) {
				// Parsing an escape character;
				// reset the flag and just advance to the next char.
				inEscape = false;
			} else if (ch === CharCode.Slash && !inCharacterClass) {
				// A slash within a character class is permissible,
				// but in general it signals the end of the regexp literal.
				p++;
				break;
			} else if (ch === CharCode.OpenSquareBracket) {
				inCharacterClass = true;
			} else if (ch === CharCode.Backslash) {
				inEscape = true;
			} else if (ch === CharCode.CloseSquareBracket) {
				inCharacterClass = false;
			}
			p++;
		}

		// Consume the optional 'i' // TODO@ulugbekna: support other flags
		let type = TokenType.RegexStr;
		if (p < this._input.length && this._input.charCodeAt(p) === CharCode.i) {
			p++;
			type = TokenType.RegexStrI;
		}

		this._current = p;

		const start = this._start + 1;
		const end = type === TokenType.RegexStrI ? this._current - 2 : this._current - 1;
		const lexeme = this._input.substring(start, end);

		return { type, lexeme, offset: this._start + 1 };
	}

	// invariant: this must not fail if at end of `this._value`
	private _eatWhitespace() {
		Scanner._whitespace.lastIndex = this._current;
		const match = Scanner._whitespace.exec(this._input);
		if (match) {
			this._current += match[0].length;
		}
	}

	private _isAtEnd() {
		return this._current >= this._input.length;
	}

	*[Symbol.iterator](): Iterator<Token> {
		while (true) {
			const token = this.next();
			yield token;
			if (token?.type === TokenType.EOF) {
				break;
			}
		}
	}
}


