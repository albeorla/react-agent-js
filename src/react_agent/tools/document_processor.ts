import { Tool } from "@langchain/core/tools";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { PineconeRecord, Index, RecordMetadata } from "@pinecone-database/pinecone";
import { initializeIndex, upsertVectors } from "../vector_store.js";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";

interface SearchResult {
  url: string;
  title: string;
  content?: string;
  snippet?: string;
  published?: string;
}

interface ProcessError extends Error {
  code?: string;
}

interface DocumentState {
  filePath: string;
  lastProcessedLine: number;
  validatedClaims: {
    claim: string;
    isValid: boolean;
    sources: string[];
    suggestedCorrection?: string;
    confidence?: number;
  }[];
  progress: {
    totalClaims: number;
    validatedClaims: number;
    lastUpdated: string;
  };
}

interface ProcessRequest {
  action: string;
  filePath: string;
  claimIndex?: number;
  claim?: string;
}

interface ValidationResult {
  isValid: boolean;
  sources: string[];
  confidence: number;
  suggestedCorrection?: string;
}

/**
 * Tool for processing and validating research documents
 */
export class DocumentProcessor extends Tool {
  name = "document_processor";
  description = "Process and validate research documents. Input should be a JSON string with 'action' ('process', 'validate', 'update', or 'status') and relevant data.";
  
  private index!: Index;
  private documentsPath: string;
  private documentStates: Map<string, DocumentState>;
  private initPromise: Promise<void>;
  private searchTool: TavilySearchResults;
  private sessionFile: string;
  
  constructor(workspacePath: string) {
    super();
    this.documentsPath = join(workspacePath, 'docs', 'research');
    this.sessionFile = join(workspacePath, '.document_processor_session.json');
    this.documentStates = new Map();
    this.searchTool = new TavilySearchResults({
      maxResults: 3,
    });
    this.initPromise = this.initializeStore();
    this.loadSession();
  }
  
  private async initializeStore() {
    try {
      this.index = await initializeIndex();
    } catch (error) {
      console.error('Failed to initialize Pinecone:', error);
      throw error;
    }
  }
  
  /**
   * Extract claims from a text that need validation
   */
  private extractClaims(text: string): string[] {
    // Split text into paragraphs
    const paragraphs = text.split('\n').filter(Boolean);
    
    // Process each paragraph
    const allClaims: string[] = [];
    
    for (const paragraph of paragraphs) {
      // Skip markdown headers and formatting
      if (paragraph.startsWith('#') || paragraph.trim().length < 10) {
        continue;
      }
      
      // Split into sentences
      const sentences = paragraph
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      // Analyze each sentence for claims
      for (const sentence of sentences) {
        if (this.isClaim(sentence)) {
          allClaims.push(sentence);
        }
      }
    }
    
    return allClaims;
  }
  
  /**
   * Check if a sentence contains a claim that needs validation
   */
  private isClaim(sentence: string): boolean {
    // Basic filters
    if (
      sentence.length < 10 || // Too short
      sentence.includes('?') || // Questions
      /^[\W\s]*$/.test(sentence) // Only punctuation/whitespace
    ) {
      return false;
    }
    
    // Skip subjective or uncertain statements
    const uncertaintyMarkers = [
      'i think',
      'maybe',
      'perhaps',
      'possibly',
      'might',
      'could',
      'may',
      'in my opinion',
      'i believe',
      'i feel'
    ];
    
    const lowerSentence = sentence.toLowerCase();
    if (uncertaintyMarkers.some(marker => lowerSentence.includes(marker))) {
      return false;
    }
    
    // Look for statement indicators
    const statementIndicators = [
      ' is ',
      ' are ',
      ' was ',
      ' were ',
      ' will ',
      ' has ',
      ' have ',
      ' can ',
      ' must ',
      ' should ',
      ' would ',
      ' does ',
      ' do ',
      ' causes ',
      ' means ',
      ' shows ',
      ' proves ',
      ' demonstrates ',
      ' indicates '
    ];
    
    return statementIndicators.some(indicator => lowerSentence.includes(indicator));
  }
  
  /**
   * Validate a claim using Tavily search and source credibility checking
   */
  private async validateClaim(claim: string): Promise<ValidationResult> {
    try {
      console.log('Validating claim:', claim);
      
      const searchResponse = await this.searchTool.invoke(claim);
      console.log('Search response:', searchResponse);
      
      const results: SearchResult[] = typeof searchResponse === 'string' ? 
        JSON.parse(searchResponse) : searchResponse;
      
      if (!results || !Array.isArray(results)) {
        console.error('Invalid search results:', results);
        throw new Error('Invalid search results format');
      }

      // Filter out results with missing required fields
      const validResults = results.filter((result): result is SearchResult => 
        typeof result.url === 'string' && 
        typeof result.title === 'string'
      );

      // Calculate source credibility and relevance
      const validSources = validResults.filter(result => {
        const url = result.url.toLowerCase();
        return (
          !url.includes('reddit.com') &&
          !url.includes('facebook.com') &&
          !url.includes('twitter.com') &&
          !url.includes('tiktok.com') &&
          (url.includes('.edu') ||
           url.includes('.gov') ||
           url.includes('.org') ||
           this.isReputableDomain(url))
        );
      });
      console.log('Valid sources:', validSources);

      if (validSources.length === 0) {
        console.log('No credible sources found for claim:', claim);
        return {
          isValid: false,
          sources: [],
          confidence: 0,
          suggestedCorrection: "Unable to verify claim due to lack of credible sources"
        };
      }

      // Analyze search results to determine claim validity
      let totalScore = 0;
      let totalRelevance = 0;

      for (const result of validSources) {
        const content = `${result.title || ''} ${result.content || result.snippet || ''}`.toLowerCase();
        const claimWords = claim.toLowerCase().split(' ').filter(word => 
          !['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'].includes(word)
        );
        
        // Calculate relevance score based on key terms
        const relevantWords = claimWords.filter(word => content.includes(word)).length;
        const relevanceScore = relevantWords / claimWords.length;
        
        // Look for evidence strength indicators
        const supportPhrases = [
          'proven', 'confirmed', 'demonstrated', 'shown', 'verified', 'established',
          'evidence shows', 'research indicates', 'studies confirm', 'data shows'
        ];
        const contradictPhrases = [
          'false', 'incorrect', 'myth', 'debunked', 'disproven', 'wrong',
          'no evidence', 'lacks support', 'contrary to', 'disputes'
        ];
        
        const hasSupport = supportPhrases.some(phrase => content.includes(phrase));
        const hasContradiction = contradictPhrases.some(phrase => content.includes(phrase));
        
        console.log('Content analysis:', {
          relevanceScore,
          hasSupport,
          hasContradiction,
          content
        });
        
        // Calculate evidence score
        let score = relevanceScore;
        if (hasSupport) score += 0.3;
        if (hasContradiction) score -= 0.3;
        
        totalScore += Math.max(0, Math.min(1, score));
        totalRelevance += relevanceScore;
      }

      const avgScore = validSources.length > 0 ? totalScore / validSources.length : 0;
      const avgRelevance = validSources.length > 0 ? totalRelevance / validSources.length : 0;
      
      // Calculate confidence based on evidence strength and relevance
      const confidence = Math.max(0.1, Math.min(1, (avgScore * 0.7 + avgRelevance * 0.3)));
      
      console.log('Final scores:', {
        avgScore,
        avgRelevance,
        confidence
      });

      // A claim is considered valid if:
      // 1. It has high confidence (> 0.4) AND no contradictions were found
      // 2. OR it has very high confidence (> 0.7) regardless of contradictions
      const hasContradictions = validSources.some(s => 
        (s.content || s.snippet || '').toLowerCase().includes('false') ||
        (s.content || s.snippet || '').toLowerCase().includes('incorrect') ||
        (s.content || s.snippet || '').toLowerCase().includes('myth') ||
        (s.content || s.snippet || '').toLowerCase().includes('debunked')
      );

      const isValid = (confidence > 0.4 && !hasContradictions) || confidence > 0.7;

      const result = {
        isValid,
        sources: validSources.map(s => s.url),
        confidence,
        suggestedCorrection: !isValid ? 
          validSources[0]?.snippet || "Consider revising based on available evidence" : undefined
      };
      
      console.log('Validation result:', result);
      return result;
    } catch (error) {
      const processError = error as ProcessError;
      console.error('Validation error:', processError);
      return {
        isValid: false,
        sources: [],
        confidence: 0,
        suggestedCorrection: `Error during validation: ${processError.message}`
      };
    }
  }

  /**
   * Check if a domain is from a reputable source
   */
  private isReputableDomain(url: string): boolean {
    const reputableDomains = [
      'nature.com',
      'science.org',
      'sciencedirect.com',
      'springer.com',
      'ieee.org',
      'acm.org',
      'cell.com',
      'nejm.org',
      'nih.gov',
      'cdc.gov',
      'who.int',
      'arxiv.org'
    ];
    
    return reputableDomains.some(domain => url.includes(domain));
  }

  /**
   * Load previous session state
   */
  private async loadSession() {
    try {
      const data = await readFile(this.sessionFile, 'utf-8');
      const session = JSON.parse(data);
      this.documentStates = new Map(Object.entries(session));
    } catch (error) {
      // No previous session or invalid file - start fresh
      this.documentStates = new Map();
    }
  }

  /**
   * Save current session state
   */
  private async saveSession() {
    try {
      const session = Object.fromEntries(this.documentStates);
      await writeFile(this.sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Get progress status for a document
   */
  private getDocumentStatus(filePath: string): string {
    const state = this.documentStates.get(filePath);
    if (!state) {
      return 'Document not processed';
    }

    const { progress } = state;
    const percentage = Math.round((progress.validatedClaims / progress.totalClaims) * 100);
    
    return `Progress: ${percentage}% (${progress.validatedClaims}/${progress.totalClaims} claims validated)
Last updated: ${progress.lastUpdated}`;
  }

  async _call(
    input: string,
    runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    try {
      await this.initPromise;
      
      const request = JSON.parse(input) as ProcessRequest;
      
      if (!request.filePath) {
        throw new Error('filePath is required');
      }
      
      switch (request.action) {
        case "process": {
          const fullPath = join(this.documentsPath, request.filePath);
          
          // Initialize document state if needed
          if (!this.documentStates.has(request.filePath)) {
            const content = await readFile(fullPath, 'utf-8');
            const claims = this.extractClaims(content);
            this.documentStates.set(request.filePath, {
              filePath: request.filePath,
              lastProcessedLine: 0,
              validatedClaims: [],
              progress: {
                totalClaims: claims.length,
                validatedClaims: 0,
                lastUpdated: new Date().toISOString()
              }
            });
          }
          
          // Process document and update state
          const state = this.documentStates.get(request.filePath)!;
          let content: string;
          try {
            content = await readFile(fullPath, 'utf-8');
          } catch (error) {
            const processError = error as ProcessError;
            return JSON.stringify({
              error: `Failed to read file: ${processError.message}`,
              code: 'FILE_READ_ERROR'
            });
          }
          
          const claims = this.extractClaims(content);
          
          // Store claims in Pinecone for tracking
          try {
            const vectors: PineconeRecord[] = claims.map((claim, index) => ({
              id: `${request.filePath}-claim-${index}`,
              values: Array(1536).fill(0).map((_, i) => (i % 10) / 10),
              metadata: {
                claim,
                filePath: request.filePath,
                isValidated: false
              } as RecordMetadata
            }));
            
            await upsertVectors(this.index, vectors);
          } catch (error) {
            const processError = error as ProcessError;
            return JSON.stringify({
              error: `Failed to store claims: ${processError.message}`,
              code: 'STORAGE_ERROR'
            });
          }
          
          // Update progress
          state.progress.lastUpdated = new Date().toISOString();
          await this.saveSession();
          
          await runManager?.handleText("Processing document...");
          
          return JSON.stringify({
            status: 'success',
            claimsFound: claims.length,
            claims
          });
        }
        
        case "validate": {
          if (!request.claim || typeof request.claimIndex !== 'number') {
            return JSON.stringify({
              error: 'claim and claimIndex are required for validation',
              code: 'INVALID_REQUEST'
            });
          }

          const state = this.documentStates.get(request.filePath);
          
          if (!state) {
            return JSON.stringify({
              error: `No state found for file: ${request.filePath}`,
              code: 'NO_STATE_ERROR'
            });
          }

          // Validate the claim using Tavily search
          const validationResult = await this.validateClaim(request.claim);
          
          // Update claim validation state
          state.validatedClaims[request.claimIndex] = {
            claim: request.claim,
            isValid: validationResult.isValid,
            sources: validationResult.sources,
            suggestedCorrection: validationResult.suggestedCorrection,
            confidence: validationResult.confidence
          };
          
          await runManager?.handleText("Validating claim...");
          
          return JSON.stringify({
            status: "success",
            message: "Claim validation updated",
            validatedClaims: state.validatedClaims.length,
            result: validationResult
          });
        }
        
        case "update": {
          const state = this.documentStates.get(request.filePath);
          
          if (!state) {
            return JSON.stringify({
              error: `No state found for file: ${request.filePath}`,
              code: 'NO_STATE_ERROR'
            });
          }
          
          const fullPath = join(this.documentsPath, request.filePath);
          let content: string;
          try {
            content = await readFile(fullPath, 'utf-8');
          } catch (error) {
            const processError = error as ProcessError;
            return JSON.stringify({
              error: `Failed to read file: ${processError.message}`,
              code: 'FILE_READ_ERROR'
            });
          }
          
          // Apply validated claims and corrections
          for (const validation of state.validatedClaims) {
            if (!validation.claim) continue;

            // Create regex to match the exact claim, handling periods and whitespace
            const claimRegex = new RegExp(
              `(${validation.claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?:\\.|$)`,
              'g'
            );

            if (!validation.isValid && validation.suggestedCorrection && validation.sources.length > 0) {
              // Replace the claim with the correction and add citation
              content = content.replace(
                claimRegex,
                `${validation.suggestedCorrection} [${validation.sources[0]}].`
              );
            } else if (validation.isValid && validation.sources.length > 0) {
              // Add citation to valid claim
              content = content.replace(
                claimRegex,
                `$1 [${validation.sources[0]}].`
              );
            }
          }
          
          try {
            await writeFile(fullPath, content, 'utf-8');
          } catch (error) {
            const processError = error as ProcessError;
            return JSON.stringify({
              error: `Failed to write file: ${processError.message}`,
              code: 'FILE_WRITE_ERROR'
            });
          }
          
          return JSON.stringify({
            status: "success",
            message: "Document updated",
            validatedClaims: state.validatedClaims.length
          });
        }
        
        case "status": {
          return this.getDocumentStatus(request.filePath);
        }
        
        default:
          return JSON.stringify({
            error: `Unknown action: ${request.action}`,
            code: 'INVALID_ACTION'
          });
      }
    } catch (error) {
      const processError = error as ProcessError;
      
      await runManager?.handleToolError(processError.message);
      
      return JSON.stringify({
        error: processError?.message || 'Unknown error occurred',
        code: processError?.code || 'GENERAL_ERROR'
      });
    }
  }

  async run(
    input: string,
    runManager?: CallbackManagerForToolRun,
  ): Promise<string> {
    return await this._call(input, runManager);
  }

  /**
   * Wait for initialization to complete - used in testing
   */
  public async waitForInit(): Promise<void> {
    await this.initPromise;
  }
} 