import { useState, useEffect } from 'react';

export const useNexum = (uid: number) => {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`/api/status?uid=${uid}`);
            const data = await res.json();
            setStatus(data);
        } catch (e) {
            console.error("NEXUM API Error", e);
        } finally {
            setLoading(false);
        }
    };

    const executeCommand = async (action: string, args: any) => {
        return await fetch('/api/pc/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, type: action, payload: args })
        }).then(r => r.json());
    };

    useEffect(() => {
        fetchStatus();
    }, [uid]);

    return { status, loading, executeCommand, refresh: fetchStatus };
};
