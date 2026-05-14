export type KnowledgeNodeKind = 'file' | 'function' | 'class' | 'method' | 'import' | 'export';

export interface KnowledgeNode {
    id: string;
    kind: KnowledgeNodeKind;
    label: string;
    fileFsPath: string;
    line?: number;
    moduleSpecifier?: string;
}

export interface KnowledgeEdge {
    fromId: string;
    toId: string;
    kind: 'imports' | 'contains' | 'exports';
}

export interface FileKnowledgeSlice {
    fileFsPath: string;
    languageId: string;
    signature: string;
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    digest: string;
}

export interface PersistedKnowledgeFile {
    version: number;
    updatedAt: string;
    workspaceRootFsPath?: string;
    slices: FileKnowledgeSlice[];
}
