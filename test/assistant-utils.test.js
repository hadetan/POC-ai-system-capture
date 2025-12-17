const test = require('node:test');
const assert = require('node:assert/strict');

const assistantModulePromise = import('../src/utils/assistantMessage.js');
const attachmentModulePromise = import('../src/utils/attachmentPreview.js');

test('mergeAssistantText keeps placeholder until content arrives', async () => {
    const { mergeAssistantText } = await assistantModulePromise;
    const result = mergeAssistantText('Thinking...', { delta: '', serverText: undefined });
    assert.equal(result.text, 'Thinking...');
    assert.equal(result.didUpdate, false);
});

test('mergeAssistantText replaces placeholder when delta arrives', async () => {
    const { mergeAssistantText } = await assistantModulePromise;
    const result = mergeAssistantText('Thinking...', { delta: 'return value', serverText: undefined });
    assert.equal(result.text, 'return value');
    assert.equal(result.didUpdate, true);
});

test('buildAttachmentPreview produces data URL using metadata', async () => {
    const { buildAttachmentPreview } = await attachmentModulePromise;
    const preview = buildAttachmentPreview({
        image: { data: 'YWJj', mime: 'image/jpeg', name: 'raw' },
        metadata: { id: 'img-123', name: 'capture-1' }
    });
    assert.equal(preview.id, 'img-123');
    assert.equal(preview.name, 'capture-1');
    assert.equal(preview.mime, 'image/jpeg');
    assert.equal(preview.dataUrl, 'data:image/jpeg;base64,YWJj');
});

test('mergeAttachmentPreviews deduplicates by id and keeps latest data', async () => {
    const { mergeAttachmentPreviews } = await attachmentModulePromise;
    const existing = [
        { id: 'img-1', dataUrl: 'data:image/png;base64,AAA' }
    ];
    const incoming = [
        { id: 'img-2', dataUrl: 'data:image/png;base64,BBB' },
        { id: 'img-1', dataUrl: 'data:image/png;base64,UPDATED' }
    ];
    const merged = mergeAttachmentPreviews(existing, incoming);
    assert.equal(merged.length, 2);
    const updated = merged.find((item) => item.id === 'img-1');
    assert.ok(updated);
    assert.equal(updated.dataUrl, 'data:image/png;base64,UPDATED');
});
