import * as vscode from 'vscode';
import { streamChat } from './api';

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

                    webviewView.webview.postMessage({ type: 'streaming_start' });

                    await streamChat(
                        fullPrompt,
                        (chunk) => webviewView.webview.postMessage({ type: 'reply', value: chunk }),
                        (full) => webviewView.webview.postMessage({ type: 'streaming_complete', value: full }),
                        (err) => webviewView.webview.postMessage({ type: 'reply', value: err })
                    );
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
                .msg-user { margin-left: 20px; color: var(--vscode-descriptionForeground); }
                .msg-ai { margin-left: 0; }
                #current-response { white-space: pre-wrap; word-wrap: break-word; }
                input { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; font-family: var(--vscode-font-family); }
                input:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
        </head>
        <body>
            <div id="chat"></div>
            <input id="in" type="text" placeholder="Ask anything...">
            <script>
                const vscode = acquireVsCodeApi();
                const chat = document.getElementById('chat');
                const input = document.getElementById('in');
                let currentMessageDiv = null;
                
                window.addEventListener('message', e => {
                    if (e.data.type === 'streaming_start') {
                        input.disabled = true;
                        currentMessageDiv = document.createElement('div');
                        currentMessageDiv.className = 'msg msg-ai';
                        currentMessageDiv.innerHTML = "<b>AI:</b> <span id='current-response'></span>";
                        chat.appendChild(currentMessageDiv);
                        chat.scrollTop = chat.scrollHeight;
                    } else if (e.data.type === 'chunk') {
                        if (currentMessageDiv) {
                            const responseSpan = currentMessageDiv.querySelector('#current-response');
                            responseSpan.innerHTML += e.data.value;
                            chat.scrollTop = chat.scrollHeight;
                        } 
                    } else if (e.data.type === 'streaming_complete') {
                        input.disabled = false;
                        currentMessageDiv = null;
                    } else if (e.data.type === 'reply') {
                        const div = document.createElement('div');
                        div.className = 'msg msg-ai';
                        div.innerHTML = "<b>AI:</b> " + e.data.value;
                        chat.appendChild(div);
                        input.disabled = false;
                        chat.scrollTop = chat.scrollHeight;
                    }
                });

                input.onkeydown = (e) => {
                    if(e.key === 'Enter' && input.value && input.disabled) {
                        const userMsg = document.createElement('div');
                        userMsg.className = 'msg msg-user';
                        userMsg.innerHTML = "<b>You:</b> " + input.value;
                        chat.appendChild(userMsg);

                        vscode.postMessage({ type: 'ask', value: input.value });
                        input.value = '';
                        chat.scrollTop = chat.scrollHeight;
                        }
                }
            </script>
        </body>
        </html>`;
    }
}