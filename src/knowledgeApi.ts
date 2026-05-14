import axios from 'axios';
import type { FileKnowledgeSlice } from './knowledgeTypes';

export async function postKnowledgeBuild(
    fileFsPath: string,
    content: string,
    languageId: string
): Promise<FileKnowledgeSlice | undefined> {
    try {
        const response = await axios.post<FileKnowledgeSlice>('http://127.0.0.1:8000/knowledge/build', {
            fileFsPath,
            content,
            languageId,
        });
        return response.data;
    } catch (e) {
        console.warn('Hancode: knowledge/build API unavailable:', e);
        return undefined;
    }
}
