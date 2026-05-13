import axios from 'axios';

export async function queryLocalLLM(prompt: string, mode: 'chat' | 'complete') {
    try {
        const response = await axios.post('http://127.0.0.1:8000/generate', {
            prompt: prompt,
            mode: mode,
            conversation_id: "SIDEBAR_CHAT"
        });
        // server.py returns {"text": "..."}
        return response.data.text; 
    } catch (error) {
        console.error("API call failed:", error);
        throw error;
    }
}