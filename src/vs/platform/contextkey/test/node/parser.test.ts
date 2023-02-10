/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as popularWhenClauses from 'vs/platform/contextkey/test/common/popularWhenClauses';
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from 'vs/platform/contextkey/common/parser';
import { Scanner, Token } from 'vs/platform/contextkey/common/scanner';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
// import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

suite('Context Key Scanner', () => {

	test('see how parser parses existing when clauses', (done) => {
		const onlyErrors = true;

		const file = path.join(`/tmp/ck${onlyErrors ? '_errs_' : ''}${Date.now()}.txt`);

		const printer: string[] = [];

		function log(...ss: string[]) {
			ss.forEach(s => printer.push(s));
		}

		for (const input of popularWhenClauses.inputs) {

			const parser = new Parser();
			const ast = parser.parse(input);

			const isError = parser.lexingErrors.length > 0 || parser.parsingErrors.length > 0;

			if (!onlyErrors || isError) {
				log(`\n`, input, `\n\n`);
			}

			if (ast === undefined) {
				if (parser.lexingErrors.length > 0) {
					log('# Lexing errors:', '\n\n');
					parser.lexingErrors.forEach(token => log(Scanner.reportError(token), '\n'));
					log('\n --- \n');
				}

				if (parser.parsingErrors.length > 0) {
					log('# Parsing errors:', '\n\n');
					parser.parsingErrors.forEach(({ token, message }: { token: Token; message: string }) => log(`${message}`, '\n'));
				}

			} else {
				if (!onlyErrors) {
					log('serialized AST: ', ast.serialize(), '\n\n---\n\n');
					log('JSON AST: ', JSON.stringify(ast.serialize(), null, '\t'));
				}
			}

			if (!onlyErrors || isError) {
				log(`\n-------\n`);
			}

		}

		fs.writeFile(file, printer.join(''), (err) => {
			done(err);
		});
	});

	// inputs that are parsed better by new parser
	const whitelistInput = new Set([
		`resourceLangId == typescript || resourceLangId == javascript || resourceLangId == typescriptreact | resourceLangId == javascriptreact`,
		`!isAppcanProject && !inDebugMode && 1===2`,
		`!explorerResourceIsFolder &&  in deltanjiSupportedSchemes`,
		`!config.sqltools.disableChordKeybindings && !(editorTextFocus || editorHasSelection)`,
		`(!editorHasCodeActionsProvider && editorTextFocus) || !editorTextFocus`,
		`!inOutput && editorFocus && (editorLangId == php || editorLangId == hack)`,
		`!(resourceExtname != .json && resourceLangId != json)`,
		`workspaceFolderCount >= 1 && ( resourceLangId == asa || resourceLangId == asax || resourceLangId == ascx || resourceLangId == ashx || resourceLangId == asmx || resourceLangId == asp || resourceLangId == aspx || resourceLangId == axd || resourceLangId == cshtml || resourceLangId == ejs || resourceLangId == htm || resourceLangId == html || resourceLangId == inc || resourceLangId == jsp || resourceLangId == jspf || resourceLangId == jspx || resourceLangId == mas || resourceLangId == master || resourceLangId == mi || resourceLangId == php || resourceLangId == shtml || resourceLangId == skin || resourceLangId == tag || resourceLangId == vm || resourceLangId == xhtml || resourceLangId == as || resourceLangId == javascriptreact || resourceLangId == javascript  || resourceLangId == typescriptreact )`,
		`view === reactHierarchy`,
		`view === extension.vsKubernetesHelmRepoExplorer`,
		`!isInDiffEditor && !markdownPreviewFocus && config.Open files list`,
		`!isInDiffEditor && !markdownPreviewFocus && config.Format document with`,
		`!isInDiffEditor && !markdownPreviewFocus && config.Beautify active file`,
		`(isLinux || isMac) && isFileSystemResource`,
		`(liveshare:state != Shared && liveshare:state != Joined) || (liveshare:state == SignedOut)`,
		`(resourceLangId == html || resourceLangId == typescript) && !virtualWorkspace`,
		`(view == codemap-own-view || view == codemap-explorer-view) && codemap.autoReveal == false`,

	]);

	// investigate
	// !isInDiffEditor && !markdownPreviewFocus && config.Beautify active file


	test('parsers: infinity war', (done) => {
		const file = path.join(`/tmp/clash_ck${Date.now()}.txt`);

		const printer: string[] = [];

		function log(...ss: string[]) {
			ss.forEach(s => printer.push(s));
		}

		for (const input of popularWhenClauses.inputs) {

			if (whitelistInput.has(input)) {
				continue;
			}

			const parser = new Parser();
			const ast = parser.parse(input);

			const oldAst = ContextKeyExpr.deserialize(input);

			const astS = ast ? ast.serialize() : '[undefined]';
			const oldAstS = oldAst ? oldAst.serialize() : '[undefined]';

			if (astS !== oldAstS) {
				log(input.includes('(') ? 'miscatch' : 'mismatch', '\n\n');

				log(`\n`, input, `\n\n`);

				log(astS, '\n\n---\n\n');
				log(oldAstS);

				log('\n\n-------\n\n');
			}


			// if (astS !== oldAstS) {
			// 	log(input.includes('(') ? 'unclear ' : '', 'mismatch\n\n');

			// 	log(`\n`, input, `\n\n`);

			// 	log(JSON.stringify(ast), '\n\n---\n\n');
			// 	log(JSON.stringify(oldAst));

			// 	log('\n\n-----------------------------\n\n');
			// }
		}

		fs.writeFile(file, printer.join(''), (err) => {
			done(err);
		});
	});

	test('parsers: infinity war interactive', (done) => {
		// to fix Error: EMFILE: too many open files, open '/tmp/all_inputs_1676047539662.txt'

		const file = path.join(`/tmp/all_inputs_${Date.now()}.txt`);

		const printer: string[] = [];

		function log(...ss: string[]) {
			ss.forEach(s => printer.push(s));
		}

		for (const input of popularWhenClauses.inputs) {

			if (whitelistInput.has(input)) {
				continue;
			}

			const parser = new Parser();
			const ast = parser.parse(input);

			const oldAst = ContextKeyExpr.deserialize(input);

			const astS = ast ? ast.serialize() : '[undefined]';
			const oldAstS = oldAst ? oldAst.serialize() : '[undefined]';

			if (astS !== oldAstS) {
				// log(`input: ${input}`);
				// log(`new: ${astS}`);
				// log(`old: ${oldAstS}`);

				// if (prompt()) { badInputs.push(input); }

				if (input.includes('(')) {
					log(`\`${input}\`,`);
				}

			}

			fs.open(file, 'w', (err, fd) => {
				fs.writeFile(fd, printer.join(''), (err) => {
					fs.close(fd, (err) => {
						done(err);
					});
				});
			});
		}

	});

});
