# Migration Guide: From Gemini API to LM Studio

This document explains the changes made to migrate NovelGenerator from Google's Gemini API to local LLM inference using LM Studio.

## What Changed

### 1. API Service Layer
- **Old**: `services/geminiService.ts` using `@google/generative-ai` SDK
- **New**: `services/lmStudioService.ts` using OpenAI-compatible REST API

### 2. Configuration
- **Old Environment Variables**:
  ```env
  API_KEY=your_gemini_api_key_here
  ```
  
- **New Environment Variables**:
  ```env
  LM_STUDIO_URL=http://127.0.0.1:1234/v1
  LM_STUDIO_MODEL=llama-3.1-instruct-13b
  ```

### 3. Model Reference
- **Old Constant**: `GEMINI_MODEL_NAME = 'gemini-2.5-flash'`
- **New Constant**: `LM_STUDIO_MODEL_NAME = 'llama-3.1-instruct-13b'`

### 4. Dependencies
- **Removed**: `@google/generative-ai` (no longer needed)
- **Added**: Native `fetch` API (built-in to Node.js 18+)

## Key Features Preserved

All functionality has been maintained with local LLM inference:

✅ **Text Generation**: Full support via `/v1/chat/completions`  
✅ **Streaming**: Real-time text streaming during generation  
✅ **JSON Structured Output**: Schema-based responses (model-dependent)  
✅ **Retry Logic**: Exponential backoff with smart error handling  
✅ **Request Queue**: Rate limiting and prioritization  
✅ **Error Handling**: Comprehensive error messages and recovery  

## API Mapping

### Function Signature Changes

#### Text Generation
```typescript
// OLD
import { generateGeminiText } from '../services/geminiService';
await generateGeminiText(prompt, systemInstruction, responseSchema, temperature, topP, topK);

// NEW
import { generateLMStudioText } from '../services/lmStudioService';
await generateLMStudioText(prompt, systemInstruction, responseSchema, temperature, topP, topK);
```

#### Streaming Generation
```typescript
// OLD
import { generateGeminiTextStream } from '../services/geminiService';
await generateGeminiTextStream(prompt, onChunk, systemInstruction, temperature, topP, topK);

// NEW
import { generateLMStudioTextStream } from '../services/lmStudioService';
await generateLMStudioTextStream(prompt, onChunk, systemInstruction, temperature, topP, topK);
```

### Parameter Translation

| Gemini Param | LM Studio Param | Notes |
|--------------|-----------------|-------|
| `temperature` | `temperature` | Same range (0-1) |
| `topP` | `top_p` | Same range (0-1) |
| `topK` | N/A | Not used in OpenAI-compatible API |
| `responseMimeType` | `response_format.type` | `"application/json"` → `"json_object"` |
| `responseSchema` | `response_format.schema` | Model-dependent support |

## Setup Instructions

### 1. Install LM Studio
1. Download from [lmstudio.ai](https://lmstudio.ai/)
2. Install and launch the application
3. Download your preferred model (e.g., llama-3.1-instruct-13b)

### 2. Configure LM Studio Server
1. In LM Studio, go to the "Server" tab
2. Click "Start Server"
3. Note the server address (default: `http://127.0.0.1:1234`)
4. If accessing from another machine, use the machine's IP instead of localhost

### 3. Update NovelGenerator Configuration
```bash
# Create .env file
cat > .env << EOF
LM_STUDIO_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=llama-3.1-instruct-13b
EOF

# Install dependencies
npm install

# Test the connection
node test-lmstudio.js

# Start development server
npm run dev
```

## Testing

Run the included test script to verify your setup:

```bash
node test-lmstudio.js
```

Expected output:
```
✅ Connection successful
✅ Text generation successful  
✅ JSON structured output successful
```

## Performance Considerations

### Model Selection
- **7B models**: Fast, lower quality, suitable for testing
- **13B models**: Balanced quality/speed (recommended)
- **70B models**: Highest quality, slower, requires powerful hardware

### Generation Parameters
```typescript
// For creative writing (chapters)
{
  temperature: 0.8,  // Higher for creativity
  topP: 0.9,        // Wide diversity
}

// For structured analysis
{
  temperature: 0.3,  // Lower for consistency
  topP: 0.7,        // Focused outputs
}
```

### Hardware Requirements
- **Minimum**: 16GB RAM, GPU with 8GB VRAM (for 7B models)
- **Recommended**: 32GB RAM, GPU with 16GB VRAM (for 13B models)
- **Optimal**: 64GB RAM, GPU with 24GB+ VRAM (for 70B models)

## Troubleshooting

### "Cannot connect to LM Studio"
1. Verify LM Studio is running
2. Check server is started in LM Studio
3. Verify the URL in `.env` matches LM Studio's server address
4. Check firewall settings if connecting from another machine

### "Invalid JSON response"
1. Some models don't support JSON mode - this is expected
2. The system will still work, just with less structured initial planning
3. Consider using a model with better instruction-following for JSON support

### Slow Generation
1. Check GPU utilization in LM Studio
2. Consider using a smaller model (7B instead of 13B)
3. Reduce `max_tokens` in `lmStudioService.ts` if chapters are too long
4. Ensure no other applications are using GPU resources

### Quality Issues
1. Increase model size (13B → 70B)
2. Adjust temperature (default 0.8, try 0.7 for more focused output)
3. Try different models - llama-3.1-instruct generally works well
4. Ensure model is fully loaded in LM Studio before generating

## Rollback Instructions

If you need to revert to Gemini API:

```bash
# Checkout the previous commit
git checkout HEAD~1

# Restore dependencies
npm install

# Create .env with Gemini API key
echo "API_KEY=your_gemini_api_key" > .env

# Restart server
npm run dev
```

## Files Modified

### Core Service
- ✅ `services/lmStudioService.ts` (new)
- ⚠️  `services/geminiService.ts` (kept for reference, not used)

### Updated Imports (9 files)
- ✅ `hooks/useBookGenerator.ts`
- ✅ `utils/agentCoordinator.ts`
- ✅ `utils/editingAgent.ts`
- ✅ `utils/specialistAgents.ts`
- ✅ `utils/finalEditingPass.ts`
- ✅ `utils/synthesisAgent.ts`
- ✅ `utils/professionalPolishAgent.ts`
- ✅ `utils/parserUtils.ts`
- ✅ `constants.ts`

### Configuration
- ✅ `.env.example`
- ✅ `package.json`
- ✅ `README.md`

### Testing
- ✅ `test-lmstudio.js` (new)
- ✅ `MIGRATION.md` (this file)

## Support

For issues or questions:
1. Check the [README.md](README.md) troubleshooting section
2. Run `node test-lmstudio.js` to diagnose connectivity issues
3. Verify LM Studio logs for model-specific errors
4. Open an issue on GitHub with test script output

## Future Enhancements

Potential improvements for the LM Studio integration:

- [ ] Support for multiple concurrent LM Studio instances (load balancing)
- [ ] Model auto-detection from LM Studio
- [ ] Performance metrics dashboard
- [ ] Automatic model switching based on task complexity
- [ ] Local embedding support for semantic similarity
- [ ] Custom prompt templates per model type
