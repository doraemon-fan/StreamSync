import React, { useRef, useEffect } from 'react';

export default function ViewVideoPage() {
    const videoRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:4000');
        ws.binaryType = 'arraybuffer';

        const mediaSource = new MediaSource();
        let sourceBuffer;
        const chunkQueue = [];

        videoRef.current.src = URL.createObjectURL(mediaSource);

        ws.onopen = () => console.log('WS opened');

        mediaSource.addEventListener('sourceopen', () => {
            sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8, vorbis"');

            const appendNextChunk = () => {
                if(!sourceBuffer || mediaSource.readyState !== 'open') return;
                if(chunkQueue.length === 0 || sourceBuffer.updating) return;
                const chunk = chunkQueue.shift();
                sourceBuffer.appendBuffer(chunk);
            };

            sourceBuffer.addEventListener('updateend', appendNextChunk);

            ws.onmessage = (event) => {
                const chunk = new Uint8Array(event.data);
                chunkQueue.push(chunk);
                appendNextChunk();
                console.log('Chunk received', event.data);
            };
        });

        ws.onopen = () => console.log('WS open for viewer');
        ws.onerror = (err) => console.log('WS error:', err);
        ws.onclose = () => console.log('WS closed for viewer');

        return () => ws.close();
    }, []);


    return (
        <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">View Video</h2>
            <video
                ref={videoRef}
                controls
                autoPlay
                className="w-full rounded-md border"
            />
        </div>
    );
}