
import { withResilienceTracking, apiResilienceManager } from '../utils/apiResilienceUtils';

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'llama-3.1-instruct-13b';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: string; schema?: object };
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const handleApiError = (error: unknown): Error => {
  console.error("❌ Error calling LM Studio API:", error);
  if (error instanceof Error) {
    let message = `LM Studio API Error: ${error.message}`;
    
    // Check for common error patterns
    if (error.message.includes("Failed to fetch") || error.message.includes("ECONNREFUSED")) {
      message = "LM Studio API Error: Cannot connect to LM Studio. Please ensure it's running at " + LM_STUDIO_BASE_URL;
    } else if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
      message = "LM Studio API Error: Request timed out. The generation may be too complex. Retrying...";
    } else if (error.message.includes("503") || error.message.includes("overloaded")) {
      message = "LM Studio API Error: Service is temporarily overloaded. Retrying...";
    } else if (error.message.includes("429")) {
      message = "LM Studio API Error: Rate limit exceeded. Waiting before retry...";
    } else if (error.message.includes("invalid") && error.message.includes("json")) {
      message = "LM Studio API Error: Invalid JSON response. The model may not support structured output.";
    }
    return new Error(message);
  }
  return new Error("Unknown LM Studio API Error occurred.");
};

/**
 * Enhanced retry logic with exponential backoff and smart error handling
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain permanent errors
      if (lastError.message.includes("Cannot connect to LM Studio") ||
          lastError.message.includes("Invalid JSON response")) {
        throw lastError;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        console.error(`Failed after ${maxRetries + 1} attempts:`, lastError);
        throw lastError;
      }

      // Smart delay calculation based on error type
      let delay = baseDelay * Math.pow(2, attempt);

      // Longer delays for overload/rate limit errors
      if (lastError.message.includes("overloaded") || lastError.message.includes("503")) {
        delay = Math.max(delay, 5000 + (attempt * 3000));
      } else if (lastError.message.includes("429")) {
        delay = Math.max(delay, 10000 + (attempt * 5000));
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 1000;
      delay += jitter;

      console.warn(`🔄 Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`);
      console.warn(`⏳ Waiting ${Math.round(delay/1000)}s before retry...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Retry failed");
}

/**
 * Generate text using LM Studio's chat completions endpoint
 */
export async function generateLMStudioText(
  prompt: string,
  systemInstruction?: string,
  responseSchema?: object,
  temperature?: number,
  topP?: number,
  topK?: number
): Promise<string> {
  // Use more retries for complex schema requests
  const maxRetries = responseSchema ? 7 : 5;
  const baseDelay = responseSchema ? 3000 : 2000;

  return withResilienceTracking(() => retryWithBackoff(async () => {
    try {
      const messages: ChatMessage[] = [];
      
      if (systemInstruction) {
        messages.push({
          role: 'system',
          content: systemInstruction
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });

      const requestBody: ChatCompletionRequest = {
        model: LM_STUDIO_MODEL,
        messages,
        temperature: temperature !== undefined ? temperature : 0.7,
        top_p: topP !== undefined ? topP : 0.9,
        max_tokens: 8000,
        stream: false
      };

      // Add JSON mode if response schema is provided
      if (responseSchema) {
        requestBody.response_format = {
          type: 'json_object',
          schema: responseSchema
        };
      }

      console.log(`🔄 Sending request to LM Studio API (model: ${LM_STUDIO_MODEL})...`);
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data: ChatCompletionResponse = await response.json();
        
        if (!data.choices || data.choices.length === 0) {
          throw new Error('No response from LM Studio');
        }
        
        const text = data.choices[0].message.content;
        console.log(`✅ Received response from LM Studio API (${text.length} chars)`);
        
        return text;
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle timeout specifically
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('LM Studio API Error: Request timed out after 30 seconds. The server may be overloaded or not responding.');
        }
        
        throw error;
      }

    } catch (error) {
      throw handleApiError(error);
    }
  }, maxRetries, baseDelay));
}

/**
 * Generate text with streaming support using LM Studio's chat completions endpoint
 */
export async function generateLMStudioTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature?: number,
  topP?: number,
  topK?: number
): Promise<string> {
  return retryWithBackoff(async () => {
    try {
      const messages: ChatMessage[] = [];
      
      if (systemInstruction) {
        messages.push({
          role: 'system',
          content: systemInstruction
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });

      const requestBody: ChatCompletionRequest = {
        model: LM_STUDIO_MODEL,
        messages,
        temperature: temperature !== undefined ? temperature : 0.7,
        top_p: topP !== undefined ? topP : 0.9,
        max_tokens: 8000,
        stream: true
      };

      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for streaming
      
      try {
        const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        
        if (!response.ok) {
          clearTimeout(timeoutId);
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          clearTimeout(timeoutId);
          throw new Error('No response body reader available');
        }
        
        const decoder = new TextDecoder();
        let fullText = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
          
          for (const line of lines) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON chunks
            }
          }
        }
        
        // Clear timeout only after streaming completes successfully
        clearTimeout(timeoutId);
        return fullText;
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle timeout specifically
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('LM Studio API Error: Streaming request timed out after 60 seconds. The server may be overloaded or not responding.');
        }
        
        throw error;
      }
    } catch (error) {
      throw handleApiError(error);
    }
  });
}

/**
 * Get available models from LM Studio
 */
export async function getLMStudioModels(): Promise<string[]> {
  try {
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for models
    
    try {
      const response = await fetch(`${LM_STUDIO_BASE_URL}/models`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch models`);
      }

      const data = await response.json();
      return data.data?.map((model: any) => model.id) || [];
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Failed to fetch LM Studio models: Request timed out after 10 seconds');
        return [];
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Failed to fetch LM Studio models:', error);
    return [];
  }
}

// Queue system for handling API overload scenarios (similar to Gemini)
interface QueuedRequest {
  id: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
}

class APIRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private rateLimitDelay = 1000; // Base delay between requests

  enqueue<T>(
    fn: () => Promise<T>,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        fn,
        resolve,
        reject,
        priority,
        timestamp: Date.now()
      };

      // Insert based on priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      let insertIndex = this.queue.length;

      for (let i = 0; i < this.queue.length; i++) {
        if (priorityOrder[request.priority] < priorityOrder[this.queue[i].priority]) {
          insertIndex = i;
          break;
        }
      }

      this.queue.splice(insertIndex, 0, request);
      console.log(`📋 Queued API request (${priority} priority). Queue size: ${this.queue.length}`);

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        console.log(`🔄 Processing queued request ${request.id} (${request.priority} priority)`);
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        console.error(`❌ Queued request ${request.id} failed:`, error);
        request.reject(error);
      }

      // Rate limiting between requests
      if (this.queue.length > 0) {
        console.log(`⏳ Rate limiting: waiting ${this.rateLimitDelay}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      }
    }

    this.processing = false;
    console.log(`✅ Queue processing complete`);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  adjustRateLimit(increase: boolean) {
    if (increase) {
      this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 10000);
      console.log(`📈 Increased rate limit delay to ${this.rateLimitDelay}ms`);
    } else {
      this.rateLimitDelay = Math.max(this.rateLimitDelay * 0.8, 500);
      console.log(`📉 Decreased rate limit delay to ${this.rateLimitDelay}ms`);
    }
  }
}

// Global queue instance
const requestQueue = new APIRequestQueue();

/**
 * Queued version of generateLMStudioText for high-load scenarios
 */
export async function generateLMStudioTextQueued(
  prompt: string,
  systemInstruction?: string,
  responseSchema?: object,
  temperature?: number,
  topP?: number,
  topK?: number,
  priority: 'high' | 'medium' | 'low' = 'medium'
): Promise<string> {
  return requestQueue.enqueue(
    () => generateLMStudioText(prompt, systemInstruction, responseSchema, temperature, topP, topK),
    priority
  );
}

/**
 * Get queue status for UI display
 */
export function getQueueStatus() {
  return {
    size: requestQueue.getQueueSize(),
    processing: requestQueue.isProcessing()
  };
}
