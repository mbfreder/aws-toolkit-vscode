/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { RecommendationHandler } from '../service/recommendationHandler'
import { session } from '../util/codeWhispererSession'
import { RecommendationService } from '../service/recommendationService'

/**
 * This function is for manual trigger CodeWhisperer
 */

export async function invokeRecommendation(
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    config: ConfigurationEntry
) {
    if (!editor || !config.isManualTriggerEnabled) {
        return
    }

    /**
     * Skip when output channel gains focus and invoke
     */
    if (editor.document.languageId === 'Log') {
        return
    }
    /**
     * When using intelliSense, if invocation position changed, reject previous active recommendations
     */
    if (vsCodeState.isIntelliSenseActive && editor.selection.active !== session.startPos) {
        resetIntelliSenseState(
            config.isManualTriggerEnabled,
            config.isAutomatedTriggerEnabled,
            RecommendationHandler.instance.isValidResponse()
        )
    }

    await RecommendationService.instance.generateRecommendation(client, editor, 'OnDemand', config, undefined)
}
