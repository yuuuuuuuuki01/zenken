export type NodeType = 'agent' | 'plugin' | 'dashboard';
export type TaskStep = 'submitted' | 'auction' | 'processing' | 'staged' | 'verified' | 'accepted' | 'failed';

export interface NodeInfo {
    id: string;
    name?: string;
    type: NodeType;
    location?: {
        lat: number;
        lng: number;
    };
    status: 'idle' | 'busy' | 'offline';
    capabilities: string[];
    performanceScore: number; // 0-100: Higher is better
    rewardPoints: number; // Accumulated reward
    trustScore: number; // 0-100: Reliability
    uptimeStart?: number; // Time in ms when node most recently connected
    successCount?: number; // Total number of consensus-verified successful tasks
    bidPrice?: number; // Current bidding price from BiddingEngine
    publicKey?: string; // Node Trust Protocol: Public key for signature verification (PEM)
    resourceLimits?: {
        cpuCores: number;
        memoryGb: number;
    };
    cpuUsage?: number; // 0-100%
    memUsage?: number; // 0-100%
    totalCores?: number;
    totalMemoryGb?: number;
}

export interface EncryptionMetadata {
    iv: string;      // Base64 encoded IV
    authTag: string; // Base64 encoded AuthTag
}

export interface TaskRequest {
    taskId: string;
    type: string;
    payload: any;
    encryption?: EncryptionMetadata; // Optional encryption metadata
    requesterId: string;
    isHighLoad?: boolean; // If true, prioritize high-spec agents
    secrets?: Record<string, string>; // API Pass-through: Encrypted secrets (like API keys)
    deposit?: number; // [Phase 29] Escrowed points to compensate worker for resource abuse
    complexityScore?: number; // [Phase 29] 0-1: Estimated resource risk
    parentId?: string; // [Phase 28] Parent taskId for recursive delegation
}

export interface TaskResponse {
    taskId: string;
    status: 'success' | 'failed';
    result: any;
    workerId: string;
    signature?: string; // Node Trust Protocol: Signature of the result (Base64)
}

export interface ActiveTaskState {
    taskId: string;
    requesterId: string;
    workerId?: string;
    step: TaskStep;
    lastUpdate: number;
    details?: string;
}

export interface SystemState {
    nodes: NodeInfo[];
    activeTasks: ActiveTaskState[];
}

/**
 * [Phase 27] Deterministic Serialization
 * オブジェクトのキーをソートしてシリアライズし、署名検証の一貫性を保証する。
 */
export function canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(o => canonicalStringify(o)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}
