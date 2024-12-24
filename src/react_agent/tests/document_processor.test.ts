import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DocumentProcessor } from '../tools/document_processor.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { CLIMATE_CHANGE_RESULT, FLAT_EARTH_RESULT } from './__mocks__/tavily.js';

describe('DocumentProcessor', () => {
  let documentProcessor: DocumentProcessor;
  const testDir = join(process.cwd(), 'test-workspace');
  const researchDir = join(testDir, 'docs', 'research');
  const testFilePath = 'test-doc.md';
  
  beforeAll(async () => {
    await mkdir(researchDir, { recursive: true });
    
    const testContent = `
# Test Research Document

Climate change is causing global temperatures to rise.

The Earth is flat according to some people.

AI will revolutionize how we work in the future.
    `.trim();
    
    await writeFile(join(researchDir, testFilePath), testContent, 'utf-8');
  });

  beforeEach(async () => {
    documentProcessor = new DocumentProcessor(testDir);
    await documentProcessor.waitForInit();
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Document Processing', () => {
    it('should process a document and extract claims', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'process',
        filePath: testFilePath
      }));
      
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('success');
      expect(parsed.claimsFound).toBe(3);
      expect(parsed.claims).toEqual([
        'Climate change is causing global temperatures to rise',
        'The Earth is flat according to some people',
        'AI will revolutionize how we work in the future'
      ]);
    });
  });

  describe('Claim Validation', () => {
    beforeEach(async () => {
      // First process the document
      await documentProcessor._call(JSON.stringify({
        action: 'process',
        filePath: testFilePath
      }));
    });

    it('should validate a true claim successfully', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'validate',
        filePath: testFilePath,
        claimIndex: 0,
        claim: 'Climate change is causing global temperatures to rise'
      }));

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('success');
      expect(parsed.result.isValid).toBe(true);
      expect(parsed.result.sources).toContain(CLIMATE_CHANGE_RESULT.url);
      expect(parsed.result.confidence).toBeGreaterThan(0.4);
    });

    it('should validate a false claim appropriately', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'validate',
        filePath: testFilePath,
        claimIndex: 1,
        claim: 'The Earth is flat according to some people'
      }));

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('success');
      expect(parsed.result.isValid).toBe(false);
      expect(parsed.result.sources).toContain(FLAT_EARTH_RESULT.url);
      expect(parsed.result.confidence).toBeLessThan(0.7);
      expect(parsed.result.suggestedCorrection).toBeDefined();
    });

    it('should handle claims with no search results', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'validate',
        filePath: testFilePath,
        claimIndex: 2,
        claim: 'AI will revolutionize how we work in the future'
      }));

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('success');
      expect(parsed.result.isValid).toBe(false);
      expect(parsed.result.sources).toHaveLength(0);
      expect(parsed.result.confidence).toBe(0);
      expect(parsed.result.suggestedCorrection).toBe('Unable to verify claim due to lack of credible sources');
    });
  });

  describe('Document Status', () => {
    it('should return correct status for unprocessed document', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'status',
        filePath: 'unprocessed.md'
      }));

      expect(result).toBe('Document not processed');
    });

    it('should return progress for processed document', async () => {
      // First process the document
      await documentProcessor._call(JSON.stringify({
        action: 'process',
        filePath: testFilePath
      }));

      const result = await documentProcessor._call(JSON.stringify({
        action: 'status',
        filePath: testFilePath
      }));

      expect(result).toContain('Progress:');
      expect(result).toContain('claims validated');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid actions gracefully', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'invalid_action',
        filePath: testFilePath
      }));
      
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.code).toBe('INVALID_ACTION');
    });

    it('should handle invalid JSON input gracefully', async () => {
      const result = await documentProcessor._call('invalid json');
      const parsed = JSON.parse(result);
      
      expect(parsed.error).toBeDefined();
      expect(parsed.code).toBe('GENERAL_ERROR');
    });

    it('should handle validation without prior processing', async () => {
      const result = await documentProcessor._call(JSON.stringify({
        action: 'validate',
        filePath: 'unprocessed.md',
        claimIndex: 0,
        claim: 'Test claim'
      }));
      
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.code).toBe('NO_STATE_ERROR');
    });
  });
}); 