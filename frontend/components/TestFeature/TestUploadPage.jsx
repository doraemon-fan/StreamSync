import React, { useRef, useState, useEffect } from 'react';
import UploadVideoButton from '../../components/TestFeature/UploadVideoButton';

export default function TestUploadPage() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if(videoRef.current) {
            console.log(`Video element ready:`, videoRef.current);
        }
    }, [selectedFile]);

    // useEffect(() => {
    //     if (!selectedFile || !videoRef.current) return;

    //     const ws = new WebSocket('ws://localhost:4000');

    //     const handleTimeUpdate = () => {
    //         const currentTime = videoRef.current.currentTime;
    //         const duration = videoRef.current.duration;
    //         const startOffset = Math.floor((currentTime / duration) * selectedFile.size);
    //         const chunk = selectedFile.slice(startOffset, startOffset + 1024 * 1024);
    //         ws.send(chunk);
    //     };

    //     videoRef.current.addEventListener('timeupdate', handleTimeUpdate);

    //     return () => {
    //         videoRef.current.removeEventListener('timeupdate', handleTimeUpdate);
    //         ws.close();
    //     };
    // }, [selectedFile]);

    useEffect(() => {
        if(!selectedFile) return;

        const ws = new WebSocket('ws://localhost:4000');

        ws.onopen = () => {
            console.log('WebSocket open, starting chunk upload');

            const chunkSize = 1024 * 1024;
            let offset = 0;

            const sendNextChunk = () => {
                if(offset >= selectedFile.size) {
                    console.log('All chunks sent');
                    return;
                }

                const chunk = selectedFile.slice(offset, offset + chunkSize);
                const reader = new FileReader();
                reader.onload = () => {
                    console.log('Uploaded')
                    ws.send(reader.result);
                    offset += chunkSize;
                    setTimeout(sendNextChunk, 50); //small delay
                };
                reader.readAsArrayBuffer(chunk);
            }

            sendNextChunk();
        };

        ws.onerror = (err) => console.log('WebSocket error:', err);
        ws.onclose = () => console.log('WebSocket closed');

        return () => {
            ws.close();
        }
    }, [selectedFile]);


    const videoRef = useRef(null);

    async function handleFileSelect(file) {
        // this is where you will later call your upload service
        setSelectedFile(file);
        setMessage(`Ready to upload ${file.name} (${Math.round(file.size / 1024)} KB)`);     

        // Example: a placeholder function showing where to call upload logic
        // uploadService.simpleUpload(file).then(...)
    }

    return (
        <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Test Upload Video</h2>
        <UploadVideoButton onFileSelect={handleFileSelect} videoRef={videoRef} />


        {message && (
            <div className="mt-4 text-sm text-slate-700">{message}</div>
        )}


        {selectedFile && (
            <div className="mt-3 text-xs text-slate-500">File ready for upload</div>
        )}
        </div>
    );
}