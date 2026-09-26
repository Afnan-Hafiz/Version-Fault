import * as vscode from 'vscode';
import { RegressionPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		'versionFault.investigateRegression',
		() => RegressionPanel.createOrShow(context.extensionUri)
	);
	context.subscriptions.push(disposable);
}

export function deactivate() {}
