import React, { useState, useEffect } from 'react';
import { Activity, Clock, Database, ChevronDown, ChevronUp, Trash2, ShieldAlert } from 'lucide-react';

interface TelemetryData {
    url: string;
    method: string;
    queryCount: number;
    queryTimeMs: number;
    backendResponseTimeMs: number;
    frontendDurationMs: number;
    isError?: boolean;
    timestamp: number;
}

export const TelemetryWidget: React.FC = () => {
    const [logs, setLogs] = useState<TelemetryData[]>([]);
    const [isOpen, setIsOpen] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        const handleTelemetry = (e: Event) => {
            const customEvent = e as CustomEvent<Omit<TelemetryData, 'timestamp'>>;
            const newLog: TelemetryData = {
                ...customEvent.detail,
                timestamp: Date.now()
            };
            setLogs(prev => {
                // Keep last 10 requests
                const updated = [newLog, ...prev];
                return updated.slice(0, 10);
            });
        };

        window.addEventListener('api-telemetry', handleTelemetry);
        return () => window.removeEventListener('api-telemetry', handleTelemetry);
    }, []);

    if (logs.length === 0) return null;

    const latest = logs[0];

    const formatTime = (ms: number) => {
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms.toFixed(0)}ms`;
    };

    const getCleanUrl = (url: string) => {
        try {
            // Strip domain and query parameters for clean display
            const clean = url.split('?')[0].replace(/^\/api/, '');
            return clean || '/';
        } catch {
            return url;
        }
    };

    if (isMinimized) {
        return (
            <button
                onClick={() => setIsMinimized(false)}
                className="fixed top-20 right-4 z-[9999] flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-950/90 border border-zinc-800 text-white shadow-2xl backdrop-blur-md hover:bg-zinc-900 transition-all text-xs font-mono font-bold"
            >
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Telemetry ({latest.queryCount} Qs / {formatTime(latest.frontendDurationMs)})</span>
            </button>
        );
    }

    return (
        <div className="fixed top-20 right-4 z-[9999] w-80 rounded-2xl bg-zinc-950/90 border border-zinc-800 text-white shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold font-mono tracking-wider text-zinc-300">SYSTEM TELEMETRY</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setLogs([])}
                        className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Clear logs"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                        onClick={() => setIsMinimized(true)}
                        className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Minimize"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Latest Request Detail */}
            <div className="p-4 border-b border-zinc-850">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        latest.isError ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        latest.method === 'POST' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-zinc-800 text-zinc-300'
                    }`}>
                        {latest.method}
                    </span>
                    <span className="text-xs font-mono font-medium truncate text-zinc-400 text-right flex-1 max-w-[200px]" title={latest.url}>
                        {getCleanUrl(latest.url)}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-850/30 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[10px] font-bold tracking-tight">PAGE LOAD</span>
                        </div>
                        <span className="text-base font-mono font-bold text-white">
                            {formatTime(latest.frontendDurationMs)}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                            FE: {formatTime(latest.frontendDurationMs - latest.backendResponseTimeMs)} | BE: {formatTime(latest.backendResponseTimeMs)}
                        </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-850/30 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                            <Database className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[10px] font-bold tracking-tight">DB QUERIES</span>
                        </div>
                        <span className="text-base font-mono font-bold text-amber-400">
                            {latest.queryCount}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                            Query Time: {latest.queryTimeMs.toFixed(1)}ms
                        </span>
                    </div>
                </div>
            </div>

            {/* List Toggle */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-2 text-left flex items-center justify-between text-[10px] font-bold font-mono tracking-wider text-zinc-500 hover:text-zinc-300 bg-zinc-900/10 hover:bg-zinc-900/20 transition-all border-b border-zinc-900"
            >
                <span>RECENT REQUESTS ({logs.length})</span>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* History List */}
            {isOpen && (
                <div className="max-h-40 overflow-y-auto divide-y divide-zinc-900/60 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {logs.map((log) => (
                        <div key={log.timestamp} className="px-4 py-2 hover:bg-zinc-900/40 transition-colors flex items-center justify-between text-[11px] font-mono">
                            <div className="flex items-center gap-2 truncate max-w-[150px]">
                                {log.isError ? (
                                    <ShieldAlert className="w-3 h-3 text-red-500 shrink-0" />
                                ) : (
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        log.queryCount > 100 ? 'bg-red-500' :
                                        log.queryCount > 30 ? 'bg-amber-500' :
                                        'bg-emerald-500'
                                    }`} />
                                )}
                                <span className="text-zinc-300 truncate" title={log.url}>
                                    {getCleanUrl(log.url)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2.5 text-zinc-400">
                                <span>{log.queryCount}Q</span>
                                <span className={`font-bold ${
                                    log.frontendDurationMs > 2000 ? 'text-red-400' :
                                    log.frontendDurationMs > 500 ? 'text-amber-400' :
                                    'text-zinc-400'
                                }`}>
                                    {formatTime(log.frontendDurationMs)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
