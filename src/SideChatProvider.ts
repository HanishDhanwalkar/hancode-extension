import * as vscode from 'vscode';
import { queryLocalLLM } from './api';
import { WorkspaceKnowledgeManager } from './workspaceKnowledge';
import { escapeHtml, getDiagnosticsSummary, relativeWorkspacePath } from './helpers/utils';

export class SideChatProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _knowledge: WorkspaceKnowledgeManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        this._knowledge.setWebviewMessenger(webviewView.webview);

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (data: Record<string, unknown>) => {
            if (data.type === 'ask') {
                await this.handleAsk(webviewView, data);
            } else if (data.type === 'insertCode') {
                await this.insertAtCursor(String(data.code ?? ''));
            } else if (data.type === 'replaceSelection') {
                await this.replaceSelection(String(data.code ?? ''));
            } else if (data.type === 'openFile') {
                const p = String(data.path ?? '');
                if (p) {
                    const uri = vscode.Uri.file(p);
                    await vscode.window.showTextDocument(uri, { preview: true });
                }
            }
        });

        this.pushEditorContext(webviewView.webview);
        webviewView.webview.postMessage({
            type: 'knowledge',
            stats: { files: 0, nodes: 0, edges: 0 },
            digestPreview: this._knowledge.getPromptSummary(2000),
        });
    }

    public attachEditorBridge(context: vscode.ExtensionContext) {
        const push = () => {
            if (this._view?.webview) {
                this.pushEditorContext(this._view.webview);
            }
        };
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(push));
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.textEditor === vscode.window.activeTextEditor) {
                    push();
                }
            })
        );
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((doc) => {
                this._knowledge.indexDocumentIfSupported(doc);
            })
        );
    }

    private async handleAsk(webviewView: vscode.WebviewView, data: Record<string, unknown>) {
        const value = String(data.value ?? '');
        const preset = String(data.preset ?? 'map');
        const includeWorkspace = preset !== 'editor';
        const includeSelection = preset === 'mapSel' || preset === 'full';
        const includeDiagnostics = preset === 'full';

        try {
            const editor = vscode.window.activeTextEditor;
            const doc = editor?.document;
            const rel = doc ? relativeWorkspacePath(doc.uri) : '';
            const selectionText =
                includeSelection && editor && !editor.selection.isEmpty
                    ? doc!.getText(editor.selection)
                    : '';
            const diagnostics =
                includeDiagnostics && doc ? getDiagnosticsSummary(doc) : '';

            let editorSection = '';
            if (doc) {
                editorSection += `Active file: ${rel} (${doc.languageId})\n`;
                if (selectionText) {
                    editorSection += `Selection:\n${selectionText}\n\n`;
                }
                if (diagnostics) {
                    editorSection += `Diagnostics (errors):\n${diagnostics}\n\n`;
                }
            }

            const workspaceMap = includeWorkspace ? this._knowledge.getPromptSummary(10000) : '';
            const workspaceBlock = workspaceMap
                ? `Use WORKSPACE_MAP in the server-enriched prompt to align with existing code.\n`
                : '';

            const fullPrompt = `${editorSection}${workspaceBlock}Task:\n${value}`;

            const reply = await queryLocalLLM(fullPrompt, 'chat', {
                workspaceSummary: includeWorkspace ? workspaceMap : undefined,
                conversationId: 'SIDEBAR_CHAT',
            });
            webviewView.webview.postMessage({ type: 'reply', value: reply });
        } catch (err) {
            webviewView.webview.postMessage({
                type: 'reply',
                value: 'Could not reach the local API (http://127.0.0.1:8000).',
            });
            console.error(err);
        }
    }

    private async insertAtCursor(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !code) {
            void vscode.window.showWarningMessage('Hancode: open a file and keep the editor focused to insert code.');
            return;
        }
        await editor.edit((b) => b.insert(editor.selection.active, code));
    }

    private async replaceSelection(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            void vscode.window.showWarningMessage('Hancode: no active editor.');
            return;
        }
        const range = editor.selection.isEmpty ? new vscode.Range(editor.selection.active, editor.selection.active) : editor.selection;
        await editor.edit((b) => b.replace(range, code));
    }

    private pushEditorContext(webview: vscode.Webview) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            webview.postMessage({ type: 'context', empty: true });
            return;
        }
        const doc = editor.document;
        const rel = relativeWorkspacePath(doc.uri);
        const sel = editor.selection;
        const line = doc.lineAt(sel.active.line);
        webview.postMessage({
            type: 'context',
            empty: false,
            path: doc.uri.fsPath,
            relPath: rel,
            languageId: doc.languageId,
            line: sel.active.line + 1,
            column: sel.active.character + 1,
            linePreview: line.text.slice(0, 400),
            selectionEmpty: sel.isEmpty,
        });
    }

    private getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { margin: 0; padding: 8px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 13px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
    #ctx { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 6px; margin-bottom: 8px; background: var(--vscode-editor-inactiveSelectionBackground); font-size: 12px; line-height: 1.35; }
    #ctx .path { opacity: 0.85; word-break: break-all; }
    #ctx .meta { opacity: 0.75; margin-top: 4px; }
    #kg { font-size: 11px; opacity: 0.8; margin-bottom: 6px; }
    #chat { flex: 1; overflow-y: auto; border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; margin-bottom: 8px; }
    .msg { margin-bottom: 10px; line-height: 1.45; }
    .msg .who { font-weight: 600; margin-right: 6px; }
    pre.code { margin: 6px 0; padding: 6px; background: var(--vscode-textCodeBlock-background); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .actions { margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .tabs { display: flex; gap: 0; margin-bottom: 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; overflow: hidden; }
    .tab { flex: 1; padding: 6px 4px; font-size: 11px; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); border: none; border-right: 1px solid var(--vscode-widget-border); cursor: pointer; }
    .tab:last-child { border-right: none; }
    .tab.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); font-weight: 600; }
    input[type="text"] { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <div id="ctx"><i>No active editor</i></div>
  <div id="kg">Workspace map: not built yet. Save files; graph is written to <code>.hancode/knowledge.graph.json</code> when a folder is open.</div>
  <div id="chat"></div>
  <div class="tabs" role="tablist" aria-label="Prompt context">
    <button type="button" class="tab active" data-preset="map" title="Include workspace map only">Map</button>
    <button type="button" class="tab" data-preset="mapSel" title="Map + editor selection">Map + selection</button>
    <button type="button" class="tab" data-preset="full" title="Map + selection + error diagnostics">Full</button>
    <button type="button" class="tab" data-preset="editor" title="Editor context only (no workspace map)">Editor</button>
  </div>
  <input id="in" type="text" placeholder="Ask…" />

  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('in');
    const ctx = document.getElementById('ctx');
    const kg = document.getElementById('kg');
    let preset = 'map';
    const tabEls = () => Array.from(document.querySelectorAll('.tab'));
    tabEls().forEach((btn) => {
      btn.addEventListener('click', () => {
        preset = btn.getAttribute('data-preset') || 'map';
        tabEls().forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    function esc(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function renderAi(text) {
      const wrap = document.createElement('div');
      wrap.className = 'msg';
      const who = document.createElement('div');
      who.innerHTML = '<span class="who">AI:</span>';
      wrap.appendChild(who);

      const s = String(text);
      let i = 0;
      while (i < s.length) {
        const tick = String.fromCharCode(96);
        const trip = tick + tick + tick;
        const st = s.indexOf(trip, i);
        if (st === -1) {
          const tail = document.createElement('div');
          tail.textContent = s.slice(i);
          wrap.appendChild(tail);
          break;
        }
        if (st > i) {
          const prose = document.createElement('div');
          prose.textContent = s.slice(i, st);
          wrap.appendChild(prose);
        }
        const nl = String.fromCharCode(10);
        let lineBreak = s.indexOf(nl, st + 3);
        if (lineBreak === -1) lineBreak = st + 3;
        const close = s.indexOf(trip, lineBreak + 1);
        if (close === -1) {
          const tail = document.createElement('div');
          tail.textContent = s.slice(st);
          wrap.appendChild(tail);
          break;
        }
        const code = s.slice(lineBreak + 1, close);
        const pre = document.createElement('pre');
        pre.className = 'code';
        pre.textContent = code.replace(new RegExp(String.fromCharCode(13), 'g'), '').trimEnd();
        wrap.appendChild(pre);
        const row = document.createElement('div');
        row.className = 'actions';
        const ins = document.createElement('button');
        ins.textContent = 'Insert at cursor';
        ins.onclick = () => vscode.postMessage({ type: 'insertCode', code: code });
        const rep = document.createElement('button');
        rep.className = 'secondary';
        rep.textContent = 'Replace selection';
        rep.onclick = () => vscode.postMessage({ type: 'replaceSelection', code: code });
        row.appendChild(ins);
        row.appendChild(rep);
        wrap.appendChild(row);
        i = close + 3;
      }

      chat.appendChild(wrap);
      chat.scrollTop = chat.scrollHeight;
    }

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d.type === 'reply') {
        renderAi(d.value);
      } else if (d.type === 'context') {
        if (d.empty) {
          ctx.innerHTML = '<i>No active editor</i>';
        } else {
          ctx.innerHTML =
            '<div class="path"><b>' + esc(d.relPath || '') + '</b></div>' +
            '<div class="meta">Ln ' + d.line + ', Col ' + d.column +
            ' · ' + esc(d.languageId || '') +
            (d.selectionEmpty ? '' : ' · selection') + '</div>' +
            '<div class="meta" style="margin-top:6px;font-family:var(--vscode-editor-font-family)">' + esc(d.linePreview || '') + '</div>';
        }
      } else if (d.type === 'knowledge') {
        const s = d.stats || {};
        const p = d.persistPath ? (' · graph: ' + d.persistPath) : '';
        kg.textContent = 'Workspace map: ' + s.files + ' files · ' + s.nodes + ' nodes · ' + s.edges + ' edges' + p;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = '<span class="who">You:</span>' + esc(input.value);
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
        vscode.postMessage({ type: 'ask', value: input.value, preset });
        input.value = '';
      }
    });
  </script>
</body>
</html>`;
    }
}
