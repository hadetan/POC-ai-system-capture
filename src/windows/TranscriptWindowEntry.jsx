import { useTranscriptionSession } from '../hooks/useTranscriptionSession';
import TranscriptWindow from '../components/TranscriptWindow';

function TranscriptWindowEntry({ chunkTimeslice, preferredMimeType, platform }) {
    const session = useTranscriptionSession();

    return (
        <TranscriptWindow
            session={session}
            chunkTimeslice={chunkTimeslice}
            preferredMimeType={preferredMimeType}
            platform={platform}
        />
    );
}

export default TranscriptWindowEntry;
