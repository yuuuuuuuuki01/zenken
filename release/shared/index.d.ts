export type NodeType = 'agent' | 'plugin' | 'dashboard';
export interface NodeInfo {
    id: string;
    type: NodeType;
    location?: {
        lat: number;
        lng: number;
    };
    status: 'idle' | 'busy' | 'offline';
    capabilities: string[];
}
export interface TaskRequest {
    taskId: string;
    type: string;
    payload: any;
    requesterId: string;
}
export interface TaskResponse {
    taskId: string;
    status: 'success' | 'failed';
    result: any;
    workerId: string;
}
export interface SystemState {
    nodes: NodeInfo[];
    activeTasks: TaskRequest[];
}
