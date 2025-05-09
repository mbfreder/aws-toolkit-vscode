/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { onAccessDeniedException, CodeCatalystClient, createClient } from '../shared/clients/codecatalystClient'
import { Auth } from '../auth/auth'
import * as localizedText from '../shared/localizedText'
import { getSecondaryAuth, setScopes } from '../auth/secondaryAuth'
import { getLogger } from '../shared/logger/logger'
import globals from '../shared/extensionGlobals'
import { ToolkitError, isAwsError } from '../shared/errors'
import { MetricName, MetricShapes, telemetry } from '../shared/telemetry/telemetry'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import {
    scopesSsoAccountAccess,
    scopesCodeCatalyst,
    SsoConnection,
    Connection,
    isBuilderIdConnection,
    isSsoConnection,
    createSsoProfile,
    isValidCodeCatalystConnection,
    isIdcSsoConnection,
    hasExactScopes,
} from '../auth/connection'
import { createBuilderIdConnection } from '../auth/utils'
import { showReauthenticateMessage } from '../shared/utilities/messages'
import { ToolkitPromptSettings } from '../shared/settings'
import { setContext } from '../shared/vscode/setContext'
import { withTelemetryContext } from '../shared/telemetry/util'
import { builderIdStartUrl } from '../auth/sso/constants'

// Secrets stored on the macOS keychain appear as individual entries for each key
// This is fine so long as the user has only a few accounts. Otherwise this should
// store secrets as a map.
export class CodeCatalystAuthStorage {
    public constructor(private readonly secrets: vscode.SecretStorage) {}

    public async getPat(username: string): Promise<string | undefined> {
        return this.secrets.get(`codecatalyst.pat.${username}`)
    }

    public async storePat(username: string, pat: string): Promise<void> {
        await this.secrets.store(`codecatalyst.pat.${username}`, pat)
    }
}

export const onboardingUrl = vscode.Uri.parse('https://codecatalyst.aws/onboarding/view')

/**
 * AWS account scopes are intended to be included. Some codepaths that use defaultScopes may depend on these scopes.
 */
export const defaultScopes = [...scopesSsoAccountAccess, ...scopesCodeCatalyst]

export const isUpgradeableConnection = (conn: Connection): conn is SsoConnection =>
    isSsoConnection(conn) && !isValidCodeCatalystConnection(conn)

export function setCodeCatalystConnectedContext(isConnected: boolean) {
    return setContext('aws.codecatalyst.connected', isConnected)
}

type ConnectionState = {
    onboarded: boolean
    scopeExpired: boolean
}

const authClassName = 'AuthCodeCatalyst'

export class CodeCatalystAuthenticationProvider {
    public readonly onDidChangeActiveConnection = this.secondaryAuth.onDidChangeActiveConnection
    public readonly onAccessDeniedException = onAccessDeniedException
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(
        protected readonly storage: CodeCatalystAuthStorage,
        public readonly auth = Auth.instance,
        public readonly secondaryAuth = getSecondaryAuth(
            auth,
            'codecatalyst',
            'CodeCatalyst',
            isValidCodeCatalystConnection
        )
    ) {
        this.onDidChangeActiveConnection(async () => {
            if (this.activeConnection) {
                await this.setScopeExpired(this.activeConnection, false)
            }
            await setCodeCatalystConnectedContext(this.isConnectionValid())
            this.onDidChangeEmitter.fire()
        })

        this.onAccessDeniedException(async (showReauthPrompt: boolean) => {
            await this.accessDeniedExceptionHandler(showReauthPrompt)
            this.onDidChangeEmitter.fire()
        })

        // set initial context in case event does not trigger
        void setCodeCatalystConnectedContext(this.isConnectionValid())
    }

    public get activeConnection() {
        return this.secondaryAuth.activeConnection
    }

    public get isUsingSavedConnection() {
        return this.secondaryAuth.hasSavedConnection
    }

    public async setScopeExpired(conn: SsoConnection, isExpired: boolean) {
        await this.updateConnectionState(conn, { scopeExpired: isExpired })
    }

    public isScopeExpired(conn: SsoConnection): boolean {
        return this.getConnectionState(conn).scopeExpired
    }

    public isConnectionValid(): boolean {
        return (
            this.activeConnection !== undefined &&
            !this.secondaryAuth.isConnectionExpired &&
            !this.isScopeExpired(this.activeConnection)
        )
    }

    // Get rid of this? Not sure where to put PAT code.
    public async getPat(client: CodeCatalystClient, username = client.identity.name): Promise<string> {
        const stored = await this.storage.getPat(username)

        if (stored) {
            return stored
        }

        const resp = await client.createAccessToken({ name: 'aws-toolkits-vscode-token' })
        await this.storage.storePat(username, resp.secret)

        return resp.secret
    }

    public async getCredentialsForGit(client: CodeCatalystClient) {
        getLogger().verbose(`codecatalyst (git): attempting to provide credentials`)

        const username = client.identity.name

        try {
            return {
                username,
                password: await this.getPat(client, username),
            }
        } catch (err) {
            getLogger().verbose(`codecatalyst (git): failed to get credentials for user "${username}": %s`, err)
        }
    }

    public async restore() {
        await this.secondaryAuth.restoreConnection()
    }

    private async accessDeniedExceptionHandler(showReauthPrompt: boolean = true) {
        if (!this.isConnectionValid()) {
            return
        }

        await this.setScopeExpired(this.activeConnection!, true)
        await setCodeCatalystConnectedContext(this.isConnectionValid())

        // showReauthPrompt is true primarily when a user interaction triggered the ADE
        if (showReauthPrompt) {
            void this.showReauthenticationPrompt(this.activeConnection!)
        }
    }

    public async showReauthenticationPrompt(conn: SsoConnection): Promise<void> {
        await showReauthenticateMessage({
            message: localizedText.connectionExpired('CodeCatalyst'),
            connect: localizedText.connect,
            suppressId: 'codeCatalystConnectionExpired',
            settings: ToolkitPromptSettings.instance,
            reauthFunc: async () => {
                await this.reauthenticate(conn)
            },
        })
    }

    public async promptOnboarding(): Promise<void> {
        const message = `Using CodeCatalyst requires onboarding with a Space. Sign up with CodeCatalyst to get started.`
        const openBrowser = 'Open Browser'
        const resp = await vscode.window.showInformationMessage(message, { modal: true }, openBrowser)
        if (resp === openBrowser) {
            await openUrl(onboardingUrl)
        }

        // Mark the current execution as cancelled regardless of the user response. We could poll here instead, waiting
        // for the user to onboard. But that might take a while.
        throw new ToolkitError('Not onboarded with CodeCatalyst', { code: 'NotOnboarded', cancelled: true })
    }

    /**
     * Return a Builder ID connection that works with CodeCatalyst.
     *
     * This cannot create a Builder ID, but will return an existing Builder ID,
     * upgrading the scopes if necessary.
     */
    public async tryGetBuilderIdConnection(): Promise<SsoConnection> {
        if (this.activeConnection && isBuilderIdConnection(this.activeConnection)) {
            return this.activeConnection
        }

        type ConnectionFlowEvent = Partial<MetricShapes[MetricName]> & {
            readonly codecatalyst_connectionFlow: 'Create' | 'Switch' | 'Upgrade' // eslint-disable-line @typescript-eslint/naming-convention
        }

        const existingBuilderId = (await this.auth.listConnections()).find(isBuilderIdConnection)
        if (isValidCodeCatalystConnection(existingBuilderId)) {
            // A Builder ID with the correct scopes already exists so we can use this immediately
            await this.secondaryAuth.useNewConnection(existingBuilderId)
            return this.activeConnection!
        }

        const conn = (await this.auth.listConnections()).find(isBuilderIdConnection)

        if (conn === undefined) {
            telemetry.record({
                codecatalyst_connectionFlow: 'Create',
            } satisfies ConnectionFlowEvent as MetricShapes[MetricName])

            const newConn = await createBuilderIdConnection(this.auth, defaultScopes)
            if (this.auth.activeConnection?.id !== newConn.id) {
                await this.secondaryAuth.useNewConnection(newConn)
            }

            return newConn
        }

        const upgrade = async () => {
            telemetry.record({
                codecatalyst_connectionFlow: 'Upgrade',
            } satisfies ConnectionFlowEvent as MetricShapes[MetricName])

            return this.secondaryAuth.addScopes(conn, defaultScopes)
        }

        if (this.auth.activeConnection?.id !== conn.id) {
            telemetry.record({
                codecatalyst_connectionFlow: 'Switch',
            } satisfies ConnectionFlowEvent as MetricShapes[MetricName])

            if (isUpgradeableConnection(conn)) {
                await upgrade()
            }

            return (await this.secondaryAuth.useNewConnection(conn)) as SsoConnection
        }

        if (isUpgradeableConnection(conn)) {
            return upgrade()
        }

        throw new ToolkitError('Not connected to CodeCatalyst', { code: 'NoConnectionBadState' })
    }

    public isConnected(): boolean {
        return this.activeConnection !== undefined
    }

    public isBuilderIdInUse(): boolean {
        return this.isConnected() && isBuilderIdConnection(this.activeConnection)
    }

    public isEnterpriseSsoInUse(): boolean {
        return this.isConnected() && isIdcSsoConnection(this.activeConnection)
    }

    @withTelemetryContext({ name: 'connectToAwsBuilderId', class: authClassName })
    public async connectToAwsBuilderId(): Promise<SsoConnection> {
        let conn: SsoConnection
        let isConnectionOnboarded: boolean

        try {
            conn = await this.tryGetBuilderIdConnection()

            if (this.auth.getConnectionState(conn) === 'invalid') {
                conn = await this.reauthenticate(conn)
            }

            isConnectionOnboarded = await this.isConnectionOnboarded(conn, true)
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to connect to Builder ID', {
                code: 'FailedToConnect',
            })
        }

        if (!isConnectionOnboarded) {
            await this.promptOnboarding()
        }

        return (await this.secondaryAuth.useNewConnection(conn)) as SsoConnection
    }

    @withTelemetryContext({ name: 'connectToEnterpriseSso', class: authClassName })
    public async connectToEnterpriseSso(startUrl: string, region: string): Promise<SsoConnection> {
        let conn: SsoConnection | undefined
        let isConnectionOnboarded: boolean

        try {
            conn = (await this.auth.listConnections()).find(
                (c): c is SsoConnection => isSsoConnection(c) && c.startUrl.toLowerCase() === startUrl.toLowerCase()
            )

            if (!conn) {
                conn = await this.auth.createConnection(createSsoProfile(startUrl, region, defaultScopes))
            } else if (!isValidCodeCatalystConnection(conn)) {
                conn = await this.secondaryAuth.addScopes(conn, defaultScopes)
            }

            if (this.auth.getConnectionState(conn) === 'invalid') {
                conn = await this.reauthenticate(conn)
            }

            isConnectionOnboarded = await this.isConnectionOnboarded(conn, true)
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to connect to IAM Identity Center', {
                code: 'FailedToConnect',
            })
        }

        if (!isConnectionOnboarded) {
            await this.promptOnboarding()
        }

        return (await this.secondaryAuth.useNewConnection(conn)) as SsoConnection
    }

    /**
     * Try to ensure a specific connection is active.
     */
    @withTelemetryContext({ name: 'tryConnectTo', class: authClassName })
    public async tryConnectTo(connection: { startUrl: string; region: string }) {
        if (!this.isConnectionValid() || connection.startUrl !== this.activeConnection!.startUrl) {
            if (connection.startUrl === builderIdStartUrl) {
                await this.connectToAwsBuilderId()
            } else {
                await this.connectToEnterpriseSso(connection.startUrl, connection.region)
            }
        }
    }

    @withTelemetryContext({ name: 'reauthenticate', class: authClassName })
    public async reauthenticate(conn: SsoConnection) {
        try {
            let connToReauth = conn
            // Sanity check - connections with other scopes should have been forced out at this point.
            if (!hasExactScopes(conn, defaultScopes)) {
                const newConn = await setScopes(conn, defaultScopes)
                connToReauth = await this.secondaryAuth.useNewConnection(newConn)
            }

            return await this.auth.reauthenticate(connToReauth)
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to reauthenticate CodeCatalyst connection.')
        }
    }

    private getStates(): Record<string, ConnectionState> {
        return globals.globalState.tryGet<Record<string, ConnectionState>>('codecatalyst.connections', Object, {})
    }

    public tryGetConnectionState(conn: SsoConnection): ConnectionState | undefined {
        return this.getStates()[conn.id]
    }
    public getConnectionState(conn: SsoConnection): ConnectionState {
        return (
            this.tryGetConnectionState(conn) ?? {
                onboarded: false,
                scopeExpired: false,
            }
        )
    }

    private async setConnectionState(conn: SsoConnection, state: ConnectionState) {
        await globals.globalState.update('codecatalyst.connections', {
            ...this.getStates(),
            [conn.id]: state,
        })
    }

    private async updateConnectionState(conn: SsoConnection, state: Partial<ConnectionState>) {
        const initial = this.getConnectionState(conn)
        await this.setConnectionState(conn, { ...initial, ...state })
    }

    public async isConnectionOnboarded(conn: SsoConnection, recheck = false) {
        const state = this.tryGetConnectionState(conn)
        if (state !== undefined && !recheck) {
            return state.onboarded
        }

        try {
            await createClient(conn)
            await this.updateConnectionState(conn, { onboarded: true })

            return true
        } catch (e) {
            if (isOnboardingException(e) && this.auth.getConnectionState(conn) === 'valid') {
                await this.updateConnectionState(conn, { onboarded: false })

                return false
            }

            throw e
        }

        function isOnboardingException(e: unknown) {
            // `GetUserDetails` returns `AccessDeniedException` if the user has not onboarded
            return isAwsError(e) && e.code === 'AccessDeniedException' && e.message.includes('GetUserDetails')
        }
    }

    static #instance: CodeCatalystAuthenticationProvider | undefined

    public static get instance(): CodeCatalystAuthenticationProvider | undefined {
        return CodeCatalystAuthenticationProvider.#instance
    }

    public static fromContext(ctx: Pick<vscode.ExtensionContext, 'secrets'>) {
        return (this.#instance ??= new this(new CodeCatalystAuthStorage(ctx.secrets)))
    }
}
