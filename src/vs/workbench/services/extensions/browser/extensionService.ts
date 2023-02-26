/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAutomatedWindow } from 'vs/platform/log/browser/log';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from 'vs/workbench/services/extensions/browser/webWorkerExtensionHost';
import { FetchFileSystemProvider } from 'vs/workbench/services/extensions/browser/webWorkerFileSystemProvider';
import { AbstractExtensionService } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, extensionHostKindToString, extensionRunningPreferenceToString } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { IExtensionHost, IExtensionService, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IRemoteExtensionHostDataProvider, IRemoteExtensionHostInitData, RemoteExtensionHost } from 'vs/workbench/services/extensions/common/remoteExtensionHost';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IUserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class ExtensionService extends AbstractExtensionService implements IExtensionService {

	private _remoteInitData: IRemoteExtensionHostInitData | null = null;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWebExtensionsScannerService private readonly _webExtensionsScannerService: IWebExtensionsScannerService,
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IUserDataInitializationService private readonly _userDataInitializationService: IUserDataInitializationService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super(
			new BrowserExtensionHostKindPicker(logService),
			instantiationService,
			notificationService,
			environmentService,
			telemetryService,
			extensionEnablementService,
			fileService,
			productService,
			extensionManagementService,
			contextService,
			configurationService,
			extensionManifestPropertiesService,
			logService,
			remoteAgentService,
			remoteExtensionsScannerService,
			lifecycleService,
			userDataProfileService
		);

		// Initialize installed extensions first and do it only after workbench is ready
		lifecycleService.when(LifecyclePhase.Ready).then(async () => {
			await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
			this._initialize();
		});

		this._initFetchFileSystem();
	}

	protected async _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
		if (extension.location.scheme === Schemas.vscodeRemote) {
			return this._remoteExtensionsScannerService.scanSingleExtension(extension.location, extension.type === ExtensionType.System);
		}

		const scannedExtension = await this._webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, this._userDataProfileService.currentProfile.extensionsResource);
		if (scannedExtension) {
			return toExtensionDescription(scannedExtension);
		}

		return null;
	}

	private _initFetchFileSystem(): void {
		const provider = new FetchFileSystemProvider();
		this._register(this._fileService.registerProvider(Schemas.http, provider));
		this._register(this._fileService.registerProvider(Schemas.https, provider));
	}

	private _createLocalExtensionHostDataProvider(desiredRunningLocation: ExtensionRunningLocation): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				const allExtensions = await this.getExtensions();
				const localWebWorkerExtensions = this._runningLocations.filterByRunningLocation(allExtensions, desiredRunningLocation);
				return {
					autoStart: true,
					allExtensions: allExtensions,
					myExtensions: localWebWorkerExtensions.map(extension => extension.identifier)
				};
			}
		};
	}

	private _createRemoteExtensionHostDataProvider(remoteAuthority: string): IRemoteExtensionHostDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: async () => {
				await this.whenInstalledExtensionsRegistered();
				return this._remoteInitData!;
			}
		};
	}

	protected _createExtensionHost(runningLocation: ExtensionRunningLocation, _isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				return null;
			}
			case ExtensionHostKind.LocalWebWorker: {
				return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, false, this._createLocalExtensionHostDataProvider(runningLocation));
			}
			case ExtensionHostKind.Remote: {
				const remoteAgentConnection = this._remoteAgentService.getConnection();
				if (remoteAgentConnection) {
					return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(remoteAgentConnection.remoteAuthority), this._remoteAgentService.socketFactory);
				}
				return null;
			}
		}
	}

	private async _scanWebExtensions(): Promise<IExtensionDescription[]> {
		const system: IExtensionDescription[] = [], user: IExtensionDescription[] = [], development: IExtensionDescription[] = [];
		try {
			await Promise.all([
				this._webExtensionsScannerService.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then(extensions => user.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then(extensions => development.push(...extensions.map(e => toExtensionDescription(e, true))))
			]);
		} catch (error) {
			this._logService.error(error);
		}
		return dedupExtensions(system, user, development, this._logService);
	}

	protected async _scanAndHandleExtensions(): Promise<void> {
		// fetch the remote environment
		let [localExtensions, remoteEnv, remoteExtensions] = await Promise.all([
			this._scanWebExtensions(),
			this._remoteAgentService.getEnvironment(),
			this._remoteExtensionsScannerService.scanExtensions()
		]);
		localExtensions = this._checkEnabledAndProposedAPI(localExtensions, false);
		remoteExtensions = this._checkEnabledAndProposedAPI(remoteExtensions, false);

		const remoteAgentConnection = this._remoteAgentService.getConnection();
		// `determineRunningLocation` will look at the complete picture (e.g. an extension installed on both sides),
		// takes care of duplicates and picks a running location for each extension
		this._initializeRunningLocation(localExtensions, remoteExtensions);

		// Some remote extensions could run locally in the web worker, so store them
		const remoteExtensionsThatNeedToRunLocally = this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.LocalWebWorker);
		localExtensions = this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalWebWorker);
		remoteExtensions = this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.Remote);

		// Add locally the remote extensions that need to run locally in the web worker
		for (const ext of remoteExtensionsThatNeedToRunLocally) {
			if (!includes(localExtensions, ext.identifier)) {
				localExtensions.push(ext);
			}
		}

		const result = this._registry.deltaExtensions(remoteExtensions.concat(localExtensions), []);
		if (result.removedDueToLooping.length > 0) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', '))
			});
		}

		if (remoteEnv && remoteAgentConnection) {
			// save for remote extension's init data
			this._remoteInitData = {
				connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAgentConnection.remoteAuthority),
				pid: remoteEnv.pid,
				appRoot: remoteEnv.appRoot,
				extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
				globalStorageHome: remoteEnv.globalStorageHome,
				workspaceStorageHome: remoteEnv.workspaceStorageHome,
				allExtensions: this._registry.getAllExtensionDescriptions(),
				myExtensions: remoteExtensions.map(extension => extension.identifier),
			};
		}

		this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions());
	}

	protected _onExtensionHostExit(code: number): void {
		// Dispose everything associated with the extension host
		this.stopExtensionHosts();

		const automatedWindow = window as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationExit === 'function') {
			automatedWindow.codeAutomationExit(code);
		}
	}
}

export class BrowserExtensionHostKindPicker implements IExtensionHostKindPicker {

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result = BrowserExtensionHostKindPicker.pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference);
		this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
		return result;
	}

	public static pickRunningLocation(extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result: ExtensionHostKind[] = [];
		let canRunRemotely = false;
		for (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstalledRemotely) {
				// ui extensions run remotely if possible (but only as a last resort)
				if (preference === ExtensionRunningPreference.Remote) {
					return ExtensionHostKind.Remote;
				} else {
					canRunRemotely = true;
				}
			}
			if (extensionKind === 'workspace' && isInstalledRemotely) {
				// workspace extensions run remotely if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
					return ExtensionHostKind.Remote;
				} else {
					result.push(ExtensionHostKind.Remote);
				}
			}
			if (extensionKind === 'web' && (isInstalledLocally || isInstalledRemotely)) {
				// web worker extensions run in the local web worker if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
					return ExtensionHostKind.LocalWebWorker;
				} else {
					result.push(ExtensionHostKind.LocalWebWorker);
				}
			}
		}
		if (canRunRemotely) {
			result.push(ExtensionHostKind.Remote);
		}
		return (result.length > 0 ? result[0] : null);
	}
}

function includes(extensions: IExtensionDescription[], identifier: ExtensionIdentifier): boolean {
	for (const extension of extensions) {
		if (ExtensionIdentifier.equals(extension.identifier, identifier)) {
			return true;
		}
	}
	return false;
}

registerSingleton(IExtensionService, ExtensionService, InstantiationType.Eager);
