const fs = require('node:fs/promises');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { GeminiProvider, NoAudioTrackError } = require('./providers/gemini');

if (!parentPort) {
    throw new Error('Transcription worker must be started with a parent port.');
}

const transcriptsDir = workerData?.transcriptsDir;
if (!transcriptsDir) {
    throw new Error('Transcription worker requires a transcriptsDir value.');
}

const providerKey = workerData?.provider || 'gemini';
const providerOptions = {
    ...(workerData?.providerConfig?.[providerKey] || {}),
    ffmpegPath: workerData?.ffmpegPath || null
};

let provider;
switch (providerKey) {
    case 'gemini':
        provider = new GeminiProvider(providerOptions);
        break;
    default:
        throw new Error(`Unsupported transcription provider: ${providerKey}`);
}

const createHeader = (job, providerName, model) => {
    const lines = [
        '# Transcription',
        `Source: ${job.sourceName || 'unknown-source'}`,
        `Video: ${path.basename(job.videoPath)}`,
        `Recorded At: ${job.startedAt ? new Date(job.startedAt).toISOString() : 'unknown'}`,
        `Provider: ${providerName}`,
        `Model: ${model || 'unspecified'}`,
        `Generated At: ${new Date().toISOString()}`,
        ''
    ];
    return lines.join('\n');
};

const buildTranscriptPath = async (videoPath) => {
    await fs.mkdir(transcriptsDir, { recursive: true });
    const parsed = path.parse(videoPath);
    return path.join(transcriptsDir, `${parsed.name}.txt`);
};

const writeTranscript = async ({ header, body, transcriptPath }) => {
    const content = `${header}${body ? `${body.trim()}\n` : ''}`;
    await fs.writeFile(transcriptPath, content, 'utf8');
};

const handleJob = async (job) => {
    const startTime = Date.now();
    parentPort.postMessage({ type: 'job-started', jobId: job.id, videoPath: job.videoPath });

    let audioArtifact;
    try {
        const audioStartTime = Date.now();
        audioArtifact = await provider.prepareAudio(job.videoPath);
        const audioElapsed = Date.now() - audioStartTime;
        console.log(`[Transcription] Audio extraction took ${audioElapsed}ms for job ${job.id}`);
    } catch (error) {
        if (error instanceof NoAudioTrackError) {
            const transcriptPath = await buildTranscriptPath(job.videoPath);
            const header = createHeader(job, 'gemini', provider.modelName);
            await writeTranscript({
                header,
                body: '',
                transcriptPath
            });
            parentPort.postMessage({
                type: 'job-complete',
                jobId: job.id,
                status: 'no-audio',
                transcriptPath
            });
            return;
        }
        throw error;
    }

    try {
        const transcribeStartTime = Date.now();
        const transcript = await provider.transcribe({
            audioPath: audioArtifact.audioPath,
            contentType: audioArtifact.contentType,
            metadata: job
        });
        const transcribeElapsed = Date.now() - transcribeStartTime;
        console.log(`[Transcription] Gemini API call took ${transcribeElapsed}ms for job ${job.id}`);

        const transcriptPath = await buildTranscriptPath(job.videoPath);
        const header = createHeader(job, transcript.provider, transcript.model);
        await writeTranscript({
            header,
            body: transcript.text,
            transcriptPath
        });

        const totalElapsed = Date.now() - startTime;
        console.log(`[Transcription] Total job time: ${totalElapsed}ms for job ${job.id}`);
        
        parentPort.postMessage({
            type: 'job-complete',
            jobId: job.id,
            status: 'success',
            transcriptPath,
            provider: transcript.provider,
            model: transcript.model
        });
    } finally {
        if (audioArtifact?.audioPath) {
            await fs.rm(audioArtifact.audioPath, { force: true }).catch(() => {});
        }
    }
};

parentPort.on('message', async (job) => {
    try {
        await handleJob(job);
    } catch (error) {
        parentPort.postMessage({
            type: 'job-error',
            jobId: job?.id,
            error: {
                message: error?.message || 'Transcription failed',
                name: error?.name || 'Error'
            }
        });
    }
});
