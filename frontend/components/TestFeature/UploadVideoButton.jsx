import React, { useRef, useState } from 'react';

export default function UploadVideoButton({onFileSelect = () => {}, videoRef, accept = 'video/*', maxSizeMB = 5000, className = ''}) {
    const inputRef = useRef(null);
    const [error, setError] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [fileName, setFileName] = useState(null);

    function openFileDialog() {
        setError(null); // resets Error
        if(inputRef.current) inputRef.current.click() // points to the actual element in DOM
    }

    function handleFileChange(e) {
        const file = e.target.files && e.target.files[0];
        if(!file) return;

        // Basic validation
        const isVideo = file.type.startsWith('video/') || accept === 'video/*';
        const tooLarge = file.size > maxSizeMB * 1024 * 1024;

        if(!isVideo) {
            setError('Please select a video file.');
            return;
        }
        if(tooLarge) {
            setError(`File is too large. Max ${maxSizeMB} MB is allowed.`);
            return;
        }
        setError(null);
        setFileName(file.name);
        
        // Create a temporary preview URL (remember to revoke later)
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        // Pass file object to parent for uploading / processing
        onFileSelect(file);
    }

    // Clean Up preview URL when component unmounts or new file chosen
    React.useEffect(() => {
        return () => { // without return, we would be revoking the new file chosen
            if(previewUrl) URL.revokeObjectURL(previewUrl);
        }
    }, [previewUrl]);

    return (
        <div className={`w-full max-w-md p-4 rounded-2xl shadow-sm bg-white/60 ${className}`}>
        <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleFileChange}
            aria-hidden
        />


        <div className="flex flex-col gap-3">
            <button
                type="button"
                onClick={openFileDialog}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:shadow-md transition text-sm font-medium"
            >
            Upload a video
            </button>


        {error && (
            <div className="text-sm text-red-600" role="alert">
                {error}
            </div>
        )}


        {fileName && (
            <div className="text-sm text-slate-700">Selected: {fileName}</div>
        )}


        {previewUrl && (
            <div className="mt-2">
                <video
                ref={videoRef}
                src={previewUrl}
                controls
                className="w-full rounded-md border"
                aria-label="Selected video preview"
                />
            </div>
        )}


                <div className="text-xs text-slate-500">
                Tip: We only choose the file here. Upload to server should happen in the
                parent so you can swap strategies (simple POST, chunked, resumable,
                presigned S3, etc.) without touching the UI.
                </div>
            </div>
        </div>
        );
}