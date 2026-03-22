export interface NodeInfo {
    id: string;
    type: 'agent' | 'plugin' | 'dashboard';
    location?: {
        lat: number;
        lng: number;
    };
    status: 'idle' | 'busy' | 'offline';
    capabilities: string[];
    performanceScore: number;
    rewardPoints: number;
    trustScore: number;
}

export interface TaskRequest {
    taskId: string;
    type: string;
    payload: unknown;
    requesterId: string;
    isHighLoad?: boolean;
}

export interface TaskResponse {
    taskId: string;
    status: 'success' | 'failed';
    result: unknown;
    workerId: string;
    signature?: string;
}
