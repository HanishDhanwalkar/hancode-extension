import axios from 'axios';

export interface GenerateOptions {
    workspaceSummary?: string;
    conversationId?: string;
}

export async function queryLocalLLM(
    prompt: string,
    mode: 'chat' | 'complete',
    opts?: GenerateOptions
): Promise<string> {
    try {
        const response = await axios.post('http://127.0.0.1:8000/generate', {
            prompt,
            mode,
            conversation_id: opts?.conversationId ?? 'SIDEBAR_CHAT',
            workspace_context: opts?.workspaceSummary ?? null,
        });
        return response.data.text as string;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}
