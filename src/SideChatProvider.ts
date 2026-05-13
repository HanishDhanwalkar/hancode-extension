import * as vscode from 'vscode';
import { queryLocalLLM } from './api';

export class SideChatProvider implements vscode.WebviewViewProvider {

    constructor(private readonly _extensionUri: vscode.Uri) { }
    
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        // This is the "Heartbeat" to prove the provider is connected
        vscode.window.showInformationMessage('Hancode: Sidebar Connected');

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'ask') {
                try {
                    // Pull active editor text for simple context
                    const editor = vscode.window.activeTextEditor;
                    const codeContext = editor ? editor.document.getText(editor.selection) : "";
                    const fullPrompt = codeContext ? `Code:\n${codeContext}\n\nTask: ${data.value}` : data.value;

                    const reply = await queryLocalLLM(fullPrompt, 'chat');
                    webviewView.webview.postMessage({ type: 'reply', value: reply });
                } catch (err) {
                    webviewView.webview.postMessage({ type: 'reply', value: "Fatal: Could not reach FastAPI server." });
                    console.error(err);
                }
            }
        });
    }

    private getHtml() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
                #chat { height: calc(100vh - 70px); overflow-y: auto; margin-bottom: 10px; font-size: 13px; }
                .msg { margin-bottom: 12px; line-height: 1.4; }
                input { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; }
            </style>
        </head>
        <body>
            <div id="chat"></div>
            <input id="in" type="text" placeholder="Ask anything...">
            <script>
                const vscode = acquireVsCodeApi();
                const chat = document.getElementById('chat');
                const input = document.getElementById('in');
                
                window.addEventListener('message', e => {
                    const div = document.createElement('div');
                    div.className = 'msg';
                    div.innerHTML = "<b>AI:</b> " + e.data.value;
                    chat.appendChild(div);
                    chat.scrollTop = chat.scrollHeight;
                });

                input.onkeydown = (e) => {
                    if(e.key === 'Enter' && input.value) {
                        vscode.postMessage({ type: 'ask', value: input.value });
                        const div = document.createElement('div');
                        div.className = 'msg';
                        div.innerHTML = "<b>You:</b> " + input.value;
                        chat.appendChild(div);
                        input.value = '';
                    }
                }
            </script>
        </body>
        </html>`;
    }
}