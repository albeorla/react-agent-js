import { describe, it, expect, beforeAll } from '@jest/globals';
import { VectorStoreTool } from '../tools/vector_store_tool.js';

describe('VectorStoreTool', () => {
  let vectorStoreTool: VectorStoreTool;
  // Create a test vector of dimension 1536 (for OpenAI embeddings)
  const testVector = Array(1536).fill(0).map((_, i) => i / 1536);

  beforeAll(async () => {
    vectorStoreTool = new VectorStoreTool();
  });

  it('should upsert vectors successfully', async () => {
    const input = JSON.stringify({
      action: 'upsert',
      vectors: [
        {
          id: 'test1',
          values: testVector,
          metadata: { text: 'Test document 1' }
        }
      ]
    });

    const result = await vectorStoreTool._call(input);
    expect(result).toContain('Successfully upserted');
  });

  it('should query vectors successfully', async () => {
    const input = JSON.stringify({
      action: 'query',
      vector: testVector,
      topK: 1
    });

    const result = await vectorStoreTool._call(input);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('matches');
  });

  it('should handle errors gracefully', async () => {
    const input = JSON.stringify({
      action: 'invalid'
    });

    const result = await vectorStoreTool._call(input);
    expect(result).toContain('Error');
  });

  it('should handle malformed vectors gracefully', async () => {
    const input = JSON.stringify({
      action: 'upsert',
      vectors: [
        {
          id: 'test2',
          values: [0.1, 0.2, 0.3], // Intentionally wrong dimension
          metadata: { text: 'Test document 2' }
        }
      ]
    });

    const result = await vectorStoreTool._call(input);
    expect(result).toContain('Error');
    expect(result).toContain('dimension');
  });
}); 