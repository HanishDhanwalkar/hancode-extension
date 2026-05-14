import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';
import { postKnowledgeBuild } from './knowledgeApi';
import type { FileKnowledgeSlice, KnowledgeEdge, KnowledgeNode, KnowledgeNodeKind, PersistedKnowledgeFile } from './knowledgeTypes';

export type { FileKnowledgeSlice, KnowledgeEdge, KnowledgeNode, KnowledgeNodeKind } from './knowledgeTypes';

/**
 * In-memory workspace map; persists merged graph to `.hancode/knowledge.graph.json`.
 * TS/JS slices from TypeScript AST in-process; Python slices from FastAPI `/knowledge/build`.
 */
export class WorkspaceKnowledgeManager {
    private readonly slices = new Map<string, FileKnowledgeSlice>();
    private webviewRef: { postMessage(msg: unknown): void } | undefined;
    private workspaceRoot: vscode.Uri | undefined;

    setWebviewMessenger(m: { postMessage(msg: unknown): void } | undefined) {
        this.webviewRef = m;
    }

    setWorkspaceRoot(root: vscode.Uri | undefined) {
        this.workspaceRoot = root;
    }

    async initializeWorkspaceState(): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }
        const hancodeDir = vscode.Uri.joinPath(this.workspaceRoot, '.hancode');
        try {
            await vscode.workspace.fs.createDirectory(hancodeDir);
        } catch {
            // already exists
        }
        const graphUri = vscode.Uri.joinPath(hancodeDir, 'knowledge.graph.json');
        try {
            const raw = await vscode.workspace.fs.readFile(graphUri);
            const parsed = JSON.parse(new TextDecoder().decode(raw)) as PersistedKnowledgeFile;
            if (Array.isArray(parsed.slices)) {
                for (const s of parsed.slices) {
                    if (s?.fileFsPath) {
                        this.slices.set(s.fileFsPath, s as FileKnowledgeSlice);
                    }
                }
            }
        } catch {
            const empty: PersistedKnowledgeFile = {
                version: 1,
                updatedAt: new Date().toISOString(),
                workspaceRootFsPath: this.workspaceRoot.fsPath,
                slices: [],
            };
            await vscode.workspace.fs.writeFile(
                graphUri,
                new TextEncoder().encode(JSON.stringify(empty, null, 2))
            );
        }
        this.notifyWebview();
    }

    attach(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                void this.reindexDocument(doc);
            })
        );
    }

    getPromptSummary(maxChars = 12000): string {
        const root = this.workspaceRoot?.fsPath;
        const parts: string[] = [];
        let used = 0;
        for (const slice of this.slices.values()) {
            if (!slice.digest) continue;
            const rel = root ? path.relative(root, slice.fileFsPath) : slice.fileFsPath;
            const chunk = `--- ${rel || path.basename(slice.fileFsPath)} ---\n${slice.digest}\n`;
            if (used + chunk.length > maxChars) break;
            parts.push(chunk);
            used += chunk.length;
        }
        if (parts.length === 0) {
            return '(No indexed workspace symbols yet; save Python files with the API running, or save TS/JS files.)';
        }
        return parts.join('\n');
    }

    getGraphJson(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
        const nodes: KnowledgeNode[] = [];
        const edges: KnowledgeEdge[] = [];
        for (const s of this.slices.values()) {
            nodes.push(...s.nodes);
            edges.push(...s.edges);
        }
        return { nodes, edges };
    }

    indexDocumentIfSupported(doc: vscode.TextDocument): void {
        void this.reindexDocument(doc);
    }

    private async reindexDocument(doc: vscode.TextDocument): Promise<void> {
        if (doc.uri.scheme !== 'file') return;
        const fp = doc.uri.fsPath;
        const lang = doc.languageId;
        const root = this.workspaceRoot?.fsPath;

        let next: FileKnowledgeSlice | undefined;
        if (isPython(lang)) {
            next = await postKnowledgeBuild(fp, doc.getText(), lang);
            if (!next) {
                return;
            }
        } else if (isSupportedJsTs(lang)) {
            next = buildFileSlice(fp, lang, doc.getText(), root);
        } else {
            return;
        }

        if (!next) {
            return;
        }

        const prev = this.slices.get(fp);
        if (prev?.signature === next.signature) {
            return;
        }
        this.slices.set(fp, next);
        this.notifyWebview();
        await this.persistDotHancode();
    }

    private async persistDotHancode(): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }
        const graphUri = vscode.Uri.joinPath(this.workspaceRoot, '.hancode', 'knowledge.graph.json');
        const payload: PersistedKnowledgeFile = {
            version: 1,
            updatedAt: new Date().toISOString(),
            workspaceRootFsPath: this.workspaceRoot.fsPath,
            slices: Array.from(this.slices.values()),
        };
        try {
            await vscode.workspace.fs.writeFile(
                graphUri,
                new TextEncoder().encode(JSON.stringify(payload, null, 2))
            );
        } catch (e) {
            console.warn('Hancode: could not persist knowledge graph:', e);
        }
    }

    private notifyWebview() {
        const { nodes, edges } = this.getGraphJson();
        const persistPath =
            this.workspaceRoot != null
                ? path.join(this.workspaceRoot.fsPath, '.hancode', 'knowledge.graph.json')
                : '';
        this.webviewRef?.postMessage({
            type: 'knowledge',
            stats: { files: this.slices.size, nodes: nodes.length, edges: edges.length },
            persistPath,
            digestPreview: this.getPromptSummary(2000),
        });
    }
}

function isPython(languageId: string): boolean {
    return languageId === 'python';
}

function isSupportedJsTs(languageId: string): boolean {
    return (
        languageId === 'javascript' ||
        languageId === 'javascriptreact' ||
        languageId === 'typescript' ||
        languageId === 'typescriptreact'
    );
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.tsx') return ts.ScriptKind.TSX;
    if (ext === '.jsx') return ts.ScriptKind.JSX;
    if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ts.ScriptKind.TS;
    return ts.ScriptKind.JS;
}

function buildFileSlice(
    fileFsPath: string,
    languageId: string,
    text: string,
    workspaceRootFsPath?: string
): FileKnowledgeSlice | undefined {
    const kind = scriptKindForPath(fileFsPath);
    const sf = ts.createSourceFile(fileFsPath, text, ts.ScriptTarget.Latest, true, kind);

    const fileId = `file:${fileFsPath}`;
    const nodes: KnowledgeNode[] = [
        { id: fileId, kind: 'file', label: path.basename(fileFsPath), fileFsPath },
    ];
    const edges: KnowledgeEdge[] = [];
    const symbolLines: string[] = [];

    const addSymbol = (kindNode: KnowledgeNodeKind, name: string, line: number) => {
        const id = `sym:${fileFsPath}:${line}:${name}`;
        nodes.push({ id, kind: kindNode, label: name, fileFsPath, line });
        edges.push({ fromId: fileId, toId: id, kind: 'contains' });
        symbolLines.push(`${kindNode}:${name}:${line}`);
    };

    const resolveModule = (spec: string): string | undefined => {
        if (spec.startsWith('node:') || spec.startsWith('vscode')) return undefined;
        if (!spec.startsWith('.') && !spec.startsWith('/')) {
            return `import:${spec}`;
        }
        try {
            const dir = path.dirname(fileFsPath);
            const resolved = path.normalize(path.join(dir, spec));
            return resolved;
        } catch {
            return undefined;
        }
    };

    for (const st of sf.statements) {
        if (ts.isImportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            const spec = st.moduleSpecifier.text;
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            const importId = `imp:${fileFsPath}:${line}:${spec}`;
            nodes.push({
                id: importId,
                kind: 'import',
                label: spec,
                fileFsPath,
                line,
                moduleSpecifier: spec,
            });
            edges.push({ fromId: fileId, toId: importId, kind: 'imports' });
            const target = resolveModule(spec);
            if (target) {
                const tgtId = target.startsWith('import:') ? `mod:${target}` : `file:${target}`;
                edges.push({ fromId: importId, toId: tgtId, kind: 'imports' });
            }
            symbolLines.push(`import:${spec}:${line}`);
        }

        if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            const spec = st.moduleSpecifier.text;
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            symbolLines.push(`reexport:${spec}:${line}`);
        }

        if (ts.isFunctionDeclaration(st) && st.name) {
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            addSymbol('function', st.name.text, line);
        }

        if (ts.isClassDeclaration(st) && st.name) {
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            addSymbol('class', st.name.text, line);
            st.members.forEach((m) => {
                if (ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
                    const ml = sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1;
                    addSymbol('method', `${st.name!.text}.${m.name.text}`, ml);
                }
            });
        }

        if (ts.isVariableStatement(st)) {
            for (const decl of st.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.initializer && ts.isArrowFunction(decl.initializer)) {
                    const line = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1;
                    addSymbol('function', `${decl.name.text}()`, line);
                }
            }
        }

        if (ts.isEnumDeclaration(st)) {
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            addSymbol('export', `enum ${st.name.text}`, line);
        }

        if (ts.isInterfaceDeclaration(st)) {
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            addSymbol('export', `interface ${st.name.text}`, line);
        }

        if (ts.isTypeAliasDeclaration(st)) {
            const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
            addSymbol('export', `type ${st.name.text}`, line);
        }
    }

    symbolLines.sort();
    const signature = symbolLines.join('|');

    const digestLines: string[] = [];
    const rel = workspaceRootFsPath ? path.relative(workspaceRootFsPath, fileFsPath) : fileFsPath;
    digestLines.push(`File: ${rel || fileFsPath}`);
    const imports = nodes.filter((n) => n.kind === 'import').map((n) => n.moduleSpecifier ?? n.label);
    if (imports.length) digestLines.push(`Imports: ${[...new Set(imports)].slice(0, 40).join(', ')}`);
    const defs = nodes.filter((n) => n.kind !== 'file' && n.kind !== 'import');
    for (const d of defs.slice(0, 80)) {
        digestLines.push(`- [${d.kind}] ${d.label}${d.line != null ? ` (L${d.line})` : ''}`);
    }
    if (defs.length > 80) digestLines.push(`... and ${defs.length - 80} more symbols`);

    return {
        fileFsPath,
        languageId,
        signature,
        nodes,
        edges,
        digest: digestLines.join('\n'),
    };
}
