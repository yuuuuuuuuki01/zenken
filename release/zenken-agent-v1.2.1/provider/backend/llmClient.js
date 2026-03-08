"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const https_1 = __importDefault(require("https"));
class LLMClient {
    apiKey;
    provider = 'mock';
    constructor(config) {
        this.updateConfig(config);
    }
    updateConfig(config) {
        this.apiKey = config.apiKey;
        if (this.apiKey && config.provider === 'openai') {
            this.provider = 'openai';
        }
        else {
            this.provider = 'mock';
        }
    }
    async ask(request) {
        if (this.provider === 'mock') {
            return this.mockInference(request);
        }
        return this.callOpenAI(request);
    }
    mockInference(request) {
        return new Promise((resolve) => {
            console.log(`[LLMClient] Mocking inference for prompt: "${request.prompt.substring(0, 50)}..."`);
            setTimeout(() => {
                resolve({
                    text: `[MOCK RESPONSE] Verified result for: ${request.prompt}`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                });
            }, 1000);
        });
    }
    callOpenAI(request) {
        return new Promise((resolve) => {
            const data = JSON.stringify({
                model: request.model || "gpt-3.5-turbo",
                messages: [{ role: "user", content: request.prompt }],
                max_tokens: request.max_tokens || 100
            });
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': data.length
                }
            };
            const req = https_1.default.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.error) {
                            resolve({ text: '', error: json.error.message });
                        }
                        else {
                            resolve({
                                text: json.choices[0].message.content,
                                usage: json.usage
                            });
                        }
                    }
                    catch (e) {
                        resolve({ text: '', error: 'Failed to parse OpenAI response' });
                    }
                });
            });
            req.on('error', (e) => {
                resolve({ text: '', error: e.message });
            });
            req.write(data);
            req.end();
        });
    }
}
exports.LLMClient = LLMClient;
