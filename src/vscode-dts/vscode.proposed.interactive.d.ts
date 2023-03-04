/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// todo@API make classes
	export interface InteractiveEditorSession {
		placeholder?: string;
	}

	// todo@API make classes
	export interface InteractiveEditorRequest {
		session: InteractiveEditorSession;
		prompt: string;

		selection: Selection;
		wholeRange: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorResponse {
		edits: TextEdit[];
		placeholder?: string;
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
		action?: string;
	}

	export interface InteractiveEditorSessionProvider {
		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareInteractiveEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<InteractiveEditorSession>;

		provideInteractiveEditorResponse(request: InteractiveEditorRequest, token: CancellationToken): ProviderResult<InteractiveEditorResponse>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		releaseInteractiveEditorSession?(session: InteractiveEditorSession): any;
	}


	export interface InteractiveSessionState { }

	export interface InteractiveSession {
		saveState?(): InteractiveSessionState;
	}

	export interface InteractiveSessionRequestArgs {
		command: string;
		args: any;
	}

	export interface InteractiveRequest {
		session: InteractiveSession;
		message: string;
	}

	export interface InteractiveResponse {
		content: string;
		followups?: string[];
	}

	export interface InteractiveResponseForProgress {
		followups?: string[];
	}

	export interface InteractiveProgress {
		content: string;
	}

	export interface InteractiveSessionProvider {
		provideInitialSuggestions?(token: CancellationToken): ProviderResult<string[]>;
		prepareSession(initialState: InteractiveSessionState | undefined, token: CancellationToken): ProviderResult<InteractiveSession>;
		resolveRequest(session: InteractiveSession, context: InteractiveSessionRequestArgs | string, token: CancellationToken): ProviderResult<InteractiveRequest>;
		provideResponse?(request: InteractiveRequest, token: CancellationToken): ProviderResult<InteractiveResponse>;
		provideResponseWithProgress?(request: InteractiveRequest, progress: Progress<InteractiveProgress>, token: CancellationToken): ProviderResult<InteractiveResponseForProgress>;
	}

	export namespace interactive {
		// current version of the proposal.
		export const _version: 1 | number;

		export function registerInteractiveSessionProvider(id: string, provider: InteractiveSessionProvider): Disposable;
		export function addInteractiveRequest(context: InteractiveSessionRequestArgs): void;

		export function registerInteractiveEditorSessionProvider(provider: InteractiveEditorSessionProvider): Disposable;
	}
}
