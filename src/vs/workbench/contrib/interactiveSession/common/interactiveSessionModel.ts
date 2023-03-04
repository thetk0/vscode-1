/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInteractiveSession } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveRequestModel {
	readonly id: string;
	readonly message: string;
	readonly response: IInteractiveResponseModel | undefined;
}

export interface IInteractiveResponseModel {
	readonly onDidChange: Event<void>;
	readonly id: string;
	readonly response: IMarkdownString;
	readonly isComplete: boolean;
	readonly followups?: string[];
}

export function isRequest(item: unknown): item is IInteractiveRequestModel {
	return !!item && typeof (item as IInteractiveRequestModel).message !== 'undefined';
}

export function isResponse(item: unknown): item is IInteractiveResponseModel {
	return !isRequest(item);
}

export class InteractiveRequestModel implements IInteractiveRequestModel {
	private static nextId = 0;

	public response: InteractiveResponseModel | undefined;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	constructor(public readonly message: string) {
		this._id = 'request_' + InteractiveRequestModel.nextId++;
	}
}

export class InteractiveResponseModel extends Disposable implements IInteractiveResponseModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	private _isComplete: boolean;
	public get isComplete(): boolean {
		return this._isComplete;
	}

	private _followups: string[] | undefined;
	public get followups(): string[] | undefined {
		return this._followups;
	}

	constructor(public response: IMarkdownString, isComplete: boolean = false, followups?: string[]) {
		super();
		this._isComplete = isComplete;
		this._followups = followups;
		this._id = 'response_' + InteractiveResponseModel.nextId++;
	}

	updateContent(responsePart: string) {
		this.response = new MarkdownString(this.response.value + responsePart);
		this._onDidChange.fire();
	}

	complete(followups: string[] | undefined): void {
		this._isComplete = true;
		this._followups = followups;
		this._onDidChange.fire();
	}
}

export interface IInteractiveSessionModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IInteractiveSessionChangeEvent>;
	readonly sessionId: number;
	getRequests(): IInteractiveRequestModel[];
}

export interface IDeserializedInteractiveSessionData {
	requests: InteractiveRequestModel[];
	providerState: any;
}

export interface ISerializableInteractiveSessionData {
	requests: { message: string; response: string | undefined }[];
	providerState: any;
}

export type IInteractiveSessionChangeEvent = IInteractiveSessionAddRequestEvent | IInteractiveSessionAddResponseEvent | IInteractiveSessionClearEvent;

export interface IInteractiveSessionAddRequestEvent {
	kind: 'addRequest';
	request: IInteractiveRequestModel;
}

export interface IInteractiveSessionAddResponseEvent {
	kind: 'addResponse';
	response: IInteractiveResponseModel;
}

export interface IInteractiveSessionClearEvent {
	kind: 'clear';
}

export class InteractiveSessionModel extends Disposable implements IInteractiveSessionModel {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IInteractiveSessionChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _requests: InteractiveRequestModel[];
	private _providerState: any;

	static deserialize(obj: ISerializableInteractiveSessionData): IDeserializedInteractiveSessionData {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			throw new Error(`Malformed session data: ${obj}`);
		}

		const requestModels = requests.map((r: any) => {
			const request = new InteractiveRequestModel(r.message);
			if (r.response) {
				request.response = new InteractiveResponseModel(new MarkdownString(r.response), true);
			}
			return request;
		});
		return { requests: requestModels, providerState: obj.providerState };
	}

	get sessionId(): number {
		return this.session.id;
	}

	constructor(public readonly session: IInteractiveSession, public readonly providerId: string, initialData?: IDeserializedInteractiveSessionData) {
		super();
		this._requests = initialData ? initialData.requests : [];
		this._providerState = initialData ? initialData.providerState : undefined;
	}

	acceptNewProviderState(providerState: any): void {
		this._providerState = providerState;
	}

	clear(): void {
		this._requests.forEach(r => r.response?.dispose());
		this._requests = [];
		this._onDidChange.fire({ kind: 'clear' });
	}

	getRequests(): InteractiveRequestModel[] {
		return this._requests;
	}

	addRequest(request: InteractiveRequestModel): void {
		// TODO this is suspicious, maybe the request should know that it is "in progress" instead of having a fake response model.
		// But the response already knows that it is "in progress" and so does a map in the session service.
		request.response = new InteractiveResponseModel(new MarkdownString(''));

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
	}

	mergeResponseContent(request: InteractiveRequestModel, part: string): void {
		if (request.response) {
			request.response.updateContent(part);
		} else {
			request.response = new InteractiveResponseModel(new MarkdownString(part));
		}
	}

	completeResponse(request: InteractiveRequestModel, followups?: string[]): void {
		request.response!.complete(followups);
	}

	setResponse(request: InteractiveRequestModel, response: InteractiveResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toJSON(): ISerializableInteractiveSessionData {
		return {
			requests: this._requests.map(r => {
				return {
					message: r.message,
					response: r.response ? r.response.response.value : undefined,
				};
			}),
			providerState: this._providerState
		};
	}

	override dispose() {
		this._requests.forEach(r => r.response?.dispose());
		this._onDidDispose.fire();
		super.dispose();
	}
}
