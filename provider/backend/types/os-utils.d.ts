declare module 'os-utils' {
    export function cpuUsage(callback: (usage: number) => void): void;
    export function cpuFree(callback: (free: number) => void): void;
    export function platform(): string;
    export function cpuCount(): number;
    export function freemem(): number;
    export function totalmem(): number;
    export function freememPercentage(): number;
    export function sysUptime(): number;
    export function processUptime(): number;
    export function loadavg(time?: number): number;
}
