import * as vscode from 'vscode';
import { RegressionPanel } from './panel';

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Version Fault');
	context.subscriptions.push(outputChannel);

	const disposable = vscode.commands.registerCommand(
		'versionFault.investigateRegression',
		() => RegressionPanel.createOrShow(context.extensionUri, outputChannel)
	);
	context.subscriptions.push(disposable);
}

export function deactivate() {}

